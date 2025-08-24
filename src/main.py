from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import shutil
import os
import logging
import traceback
import hashlib
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from .core.processing import parse_document, chunk_text, get_embedding_model
from .core.vector_store import (
    get_qdrant_client, 
    create_collection_if_not_exists, 
    upsert_vectors, 
    search_vectors,
    ensure_user_collection_exists,
    get_user_collection_name
)
from .core.llm import get_ollama_client, format_prompt, generate_response
from .core.models import QueryRequest, QueryResponse, ErrorResponse, UploadResponse
from .core.exceptions import (
    KnowledgeAssistantException,
    FileProcessingError,
    InvalidFileTypeError,
    EmptyFileError,
    VectorStoreError,
    LLMError,
    QueryValidationError,
    ServiceUnavailableError,
    AuthenticationError,
    AuthorizationError,
    TokenExpiredError,
    InvalidTokenError,
    UserNotFoundError,
    InvalidCredentialsError,
    UserAlreadyExistsError,
    InactiveUserError
)
from .core.auth import auth_backend, fastapi_users, current_active_user
from .core.schemas import UserCreate, UserRead, UserUpdate
from .core.database import User, DocumentMetadata, create_db_and_tables, get_async_session

app = FastAPI(
    title="Knowledge Assistant RAG API",
    description="API for document upload and knowledge base querying",
    version="1.0.0"
)

# Include authentication routes
app.include_router(
    fastapi_users.get_auth_router(auth_backend), prefix="/auth/jwt", tags=["auth"]
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure CORS with environment variable support
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database initialization
@app.on_event("startup")
async def on_startup():
    """Initialize database on startup"""
    await create_db_and_tables()

# Global exception handlers
@app.exception_handler(AuthenticationError)
async def authentication_exception_handler(request: Request, exc: AuthenticationError):
    """Handle authentication errors with specific logging and response format."""
    logger.warning(f"Authentication failed: {exc.detail} - Request: {request.url}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_type,
            "detail": exc.detail,
            "status_code": exc.status_code,
            "timestamp": exc.timestamp,
            "auth_required": True
        }
    )

@app.exception_handler(AuthorizationError)
async def authorization_exception_handler(request: Request, exc: AuthorizationError):
    """Handle authorization errors with specific logging and response format."""
    logger.warning(f"Authorization failed: {exc.detail} - Request: {request.url}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_type,
            "detail": exc.detail,
            "status_code": exc.status_code,
            "timestamp": exc.timestamp,
            "auth_required": True
        }
    )

@app.exception_handler(UserAlreadyExistsError)
async def user_already_exists_exception_handler(request: Request, exc: UserAlreadyExistsError):
    """Handle user registration conflicts."""
    logger.info(f"Registration attempt with existing email: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_type,
            "detail": exc.detail,
            "status_code": exc.status_code,
            "timestamp": exc.timestamp,
            "registration_error": True
        }
    )

@app.exception_handler(KnowledgeAssistantException)
async def knowledge_assistant_exception_handler(request: Request, exc: KnowledgeAssistantException):
    """Handle custom Knowledge Assistant exceptions."""
    logger.error(f"KnowledgeAssistantException: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.error_type,
            "detail": exc.detail,
            "status_code": exc.status_code,
            "timestamp": exc.timestamp
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors."""
    logger.error(f"Validation error: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={
            "error": "ValidationError",
            "detail": "Request validation failed",
            "status_code": 422,
            "timestamp": datetime.utcnow().isoformat(),
            "validation_errors": exc.errors()
        }
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle standard HTTP exceptions."""
    logger.error(f"HTTP exception: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "HTTPException",
            "detail": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions."""
    logger.error(f"Unexpected error: {str(exc)}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "detail": "An unexpected error occurred. Please try again later.",
            "status_code": 500,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

# --- Constants ---
UPLOADS_DIR = "uploads"
QDRANT_COLLECTION_NAME = "knowledge_base"
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:1b")  # Use smaller model by default

# --- Application Startup ---
# Create uploads directory if it doesn't exist
try:
    if not os.path.exists(UPLOADS_DIR):
        os.makedirs(UPLOADS_DIR)
        logger.info(f"Created uploads directory: {UPLOADS_DIR}")
except Exception as e:
    logger.error(f"Failed to create uploads directory: {str(e)}")
    raise ServiceUnavailableError("filesystem", f"Cannot create uploads directory: {str(e)}")

# Load models and clients on startup with error handling
try:
    embedding_model = get_embedding_model()
    logger.info("Embedding model loaded successfully")
except Exception as e:
    logger.error(f"Failed to load embedding model: {str(e)}")
    raise ServiceUnavailableError("embedding_model", f"Cannot load embedding model: {str(e)}")

try:
    qdrant_client = get_qdrant_client()
    logger.info("Qdrant client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Qdrant client: {str(e)}")
    raise ServiceUnavailableError("qdrant", f"Cannot connect to Qdrant: {str(e)}")

try:
    ollama_client = get_ollama_client()
    logger.info("Ollama client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Ollama client: {str(e)}")
    raise ServiceUnavailableError("ollama", f"Cannot connect to Ollama: {str(e)}")

# Get the size of the embeddings from the model
try:
    embedding_size = embedding_model.get_sentence_embedding_dimension()
    logger.info(f"Embedding dimension: {embedding_size}")
except Exception as e:
    logger.error(f"Failed to get embedding dimension: {str(e)}")
    raise ServiceUnavailableError("embedding_model", f"Cannot determine embedding dimension: {str(e)}")

# Create the Qdrant collection if it doesn't exist
try:
    create_collection_if_not_exists(qdrant_client, QDRANT_COLLECTION_NAME, embedding_size)
    logger.info(f"Qdrant collection '{QDRANT_COLLECTION_NAME}' ready")
except Exception as e:
    logger.error(f"Failed to create/verify Qdrant collection: {str(e)}")
    raise ServiceUnavailableError("qdrant", f"Cannot create collection: {str(e)}")

logger.info("Application startup completed successfully")

# --- Helper Functions ---

def calculate_file_hash(file_path: str) -> str:
    """Calculate SHA-256 hash of a file for duplicate detection."""
    hash_sha256 = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    except Exception as e:
        logger.error(f"Failed to calculate file hash for {file_path}: {str(e)}")
        raise FileProcessingError(f"Failed to calculate file hash: {str(e)}", os.path.basename(file_path))

# --- API Endpoints ---
@app.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...), 
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session)
):
    """Upload and process a document file with user-specific storage."""
    logger.info(f"Starting upload for file: {file.filename} by user: {user.email}")
    
    # Validate file exists and has a name
    if not file.filename:
        raise QueryValidationError("No filename provided")
    
    # Validate file size (10MB limit)
    if file.size and file.size > 10 * 1024 * 1024:
        raise FileProcessingError("File size exceeds 10MB limit", file.filename)
    
    # Validate file extension
    file_extension = os.path.splitext(file.filename)[1].lower()
    supported_types = [".pdf", ".txt", ".docx"]
    if file_extension not in supported_types:
        raise InvalidFileTypeError(file_extension, supported_types)

    file_path = os.path.join(UPLOADS_DIR, f"{user.id}_{file.filename}")
    
    # Save uploaded file temporarily
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"File saved successfully: {file_path}")
    except PermissionError:
        raise FileProcessingError("Permission denied when saving file", file.filename)
    except OSError as e:
        raise FileProcessingError(f"File system error: {str(e)}", file.filename)
    except Exception as e:
        raise FileProcessingError(f"Unexpected error saving file: {str(e)}", file.filename)
    
    # Process and store document
    try:
        # Calculate file hash for duplicate detection
        try:
            file_hash = calculate_file_hash(file_path)
        except Exception as e:
            raise FileProcessingError(f"Failed to calculate file hash: {str(e)}", file.filename)
        
        # Check for duplicate uploads by this user
        try:
            from sqlalchemy import select
            stmt = select(DocumentMetadata).where(
                DocumentMetadata.user_id == user.id,
                DocumentMetadata.file_hash == file_hash
            )
            result = await session.execute(stmt)
            existing_doc = result.scalar_one_or_none()
            
            if existing_doc:
                logger.info(f"Duplicate file detected for user {user.email}: {file.filename}")
                return UploadResponse(
                    filename=file.filename,
                    message=f"File already exists (uploaded as '{existing_doc.filename}' on {existing_doc.upload_date.strftime('%Y-%m-%d %H:%M:%S')})",
                    num_chunks_stored=existing_doc.chunks_count
                )
        except Exception as e:
            logger.error(f"Error checking for duplicate files: {str(e)}")
            # Continue with upload if duplicate check fails
        
        # Parse document text
        try:
            text = parse_document(file_path, file_extension)
        except Exception as e:
            raise FileProcessingError(f"Failed to parse document: {str(e)}", file.filename)
        
        # Validate extracted text
        if not text or not text.strip():
            raise EmptyFileError(file.filename)
        
        # Create text chunks
        try:
            chunks = chunk_text(text)
            if not chunks:
                raise EmptyFileError(file.filename)
        except Exception as e:
            raise FileProcessingError(f"Failed to chunk text: {str(e)}", file.filename)
        
        # Generate embeddings
        try:
            embeddings = embedding_model.encode(chunks)
        except Exception as e:
            raise LLMError(f"Failed to generate embeddings: {str(e)}")
        
        # Ensure user-specific collection exists
        try:
            user_collection_name = ensure_user_collection_exists(qdrant_client, user.id, embedding_size)
        except Exception as e:
            raise VectorStoreError(f"Failed to create user collection: {str(e)}", "collection_creation")
        
        # Prepare payloads for vector store with user context
        payloads = [
            {
                "text": chunk, 
                "source": file.filename,
                "user_id": str(user.id),
                "upload_date": datetime.utcnow().isoformat()
            } 
            for chunk in chunks
        ]
        
        # Store in user-specific vector database collection
        try:
            upsert_vectors(qdrant_client, user_collection_name, embeddings, payloads)
        except Exception as e:
            raise VectorStoreError(f"Failed to store vectors: {str(e)}", "upsert")
        
        # Store document metadata in database
        try:
            file_size = os.path.getsize(file_path)
            doc_metadata = DocumentMetadata(
                user_id=user.id,
                filename=file.filename,
                original_size=file_size,
                chunks_count=len(chunks),
                file_hash=file_hash
            )
            session.add(doc_metadata)
            await session.commit()
            logger.info(f"Stored document metadata for {file.filename}")
        except Exception as e:
            await session.rollback()
            logger.error(f"Failed to store document metadata: {str(e)}")
            # Continue without failing the upload
        
        logger.info(f"Successfully processed file: {file.filename}, chunks: {len(chunks)} for user: {user.email}")
        
        return UploadResponse(
            filename=file.filename,
            message="Successfully uploaded, processed, and stored in your personal knowledge base.",
            num_chunks_stored=len(chunks)
        )
        
    except (FileProcessingError, EmptyFileError, LLMError, VectorStoreError):
        # Re-raise custom exceptions
        raise
    except Exception as e:
        # Handle unexpected errors during processing
        logger.error(f"Unexpected error processing file {file.filename}: {str(e)}")
        raise FileProcessingError(f"Unexpected processing error: {str(e)}", file.filename)
    finally:
        # Clean up temporary file
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"Cleaned up temporary file: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to clean up temporary file {file_path}: {str(e)}")

@app.post("/query", response_model=QueryResponse)
async def query_knowledge_base(
    request: QueryRequest, 
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session)
):
    """Query the user's personal knowledge base with a question."""
    logger.info(f"Processing query: {request.query[:100]}... by user: {user.email}")
    
    try:
        # 1. Get user's collection name
        user_collection_name = get_user_collection_name(user.id)
        
        # 2. Generate query embedding
        try:
            query_embedding = embedding_model.encode(request.query)
        except Exception as e:
            logger.error(f"Failed to encode query: {str(e)}")
            raise LLMError(f"Failed to encode query: {str(e)}")

        # 3. Search for relevant documents in user's collection
        try:
            search_results = search_vectors(
                client=qdrant_client,
                collection_name=user_collection_name,
                query_vector=query_embedding,
                limit=3  # Retrieve top 3 most relevant chunks
            )
        except Exception as e:
            logger.error(f"Vector search failed: {str(e)}")
            raise VectorStoreError(f"Search operation failed: {str(e)}", "search")

        # Check if any results were found
        if not search_results:
            logger.info(f"No relevant documents found for user {user.email}")
            
            # Check if user has any documents at all
            try:
                from sqlalchemy import select, func
                stmt = select(func.count(DocumentMetadata.id)).where(DocumentMetadata.user_id == user.id)
                result = await session.execute(stmt)
                doc_count = result.scalar()
                
                if doc_count == 0:
                    message = "You haven't uploaded any documents yet. Please upload some documents to build your knowledge base before asking questions."
                else:
                    message = "I couldn't find any relevant information in your knowledge base to answer your question. Please try rephrasing your query or upload more relevant documents."
            except Exception as e:
                logger.error(f"Error checking user document count: {str(e)}")
                message = "I couldn't find any relevant information in your knowledge base to answer your question. Please try rephrasing your query or upload relevant documents."
            
            return QueryResponse(
                answer=message,
                source_documents=[]
            )

        # 4. Filter results to ensure they belong to the user (additional security check)
        filtered_results = []
        for result in search_results:
            if result.payload and result.payload.get("user_id") == str(user.id):
                filtered_results.append(result)
            else:
                logger.warning(f"Found result not belonging to user {user.id}, filtering out")
        
        if not filtered_results:
            logger.warning(f"All search results filtered out for user {user.email}")
            return QueryResponse(
                answer="I couldn't find any relevant information in your personal knowledge base to answer your question. Please try rephrasing your query or upload more relevant documents.",
                source_documents=[]
            )

        # 5. Format the prompt for the LLM
        try:
            prompt = format_prompt(request.query, filtered_results)
        except Exception as e:
            logger.error(f"Failed to format prompt: {str(e)}")
            raise LLMError(f"Failed to format prompt: {str(e)}")

        # 6. Generate a response from the LLM
        try:
            answer = generate_response(ollama_client, OLLAMA_MODEL, prompt)
            if not answer or not answer.strip():
                raise LLMError("LLM returned empty response")
        except Exception as e:
            logger.error(f"LLM response generation failed: {str(e)}")
            raise LLMError(f"Failed to generate response: {str(e)}")

        # 7. Extract and validate source documents for citation
        try:
            source_documents = []
            for result in filtered_results:
                if result.payload:
                    source_doc = {
                        "source": result.payload.get("source", "Unknown"),
                        "text": result.payload.get("text", "N/A")[:500] + "..." if len(result.payload.get("text", "")) > 500 else result.payload.get("text", "N/A"),
                        "score": float(result.score) if result.score is not None else 0.0
                    }
                    source_documents.append(source_doc)
        except Exception as e:
            logger.error(f"Failed to process source documents: {str(e)}")
            # Continue with empty source documents rather than failing
            source_documents = []

        logger.info(f"Query processed successfully for user {user.email}, found {len(source_documents)} source documents")
        
        return QueryResponse(
            answer=answer,
            source_documents=source_documents
        )

    except (LLMError, VectorStoreError, QueryValidationError):
        # Re-raise custom exceptions
        raise
    except Exception as e:
        # Handle unexpected errors
        logger.error(f"Unexpected error during query processing: {str(e)}")
        raise LLMError(f"Unexpected query processing error: {str(e)}")

@app.get("/health")
async def health_check(session: AsyncSession = Depends(get_async_session)):
    """Health check endpoint with service status monitoring."""
    health_status = {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {}
    }
    
    # Check database connection
    try:
        from sqlalchemy import text
        result = await session.execute(text("SELECT 1"))
        result.fetchone()
        health_status["services"]["database"] = {
            "status": "healthy",
            "type": "sqlite"
        }
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        health_status["services"]["database"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        health_status["status"] = "degraded"
    
    # Check Qdrant connection
    try:
        collections = qdrant_client.get_collections()
        health_status["services"]["qdrant"] = {
            "status": "healthy",
            "collections_count": len(collections.collections)
        }
    except Exception as e:
        logger.error(f"Qdrant health check failed: {str(e)}")
        health_status["services"]["qdrant"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        health_status["status"] = "degraded"
    
    # Check Ollama connection
    try:
        # Simple test to see if Ollama is responsive
        test_response = ollama_client.generate(model=OLLAMA_MODEL, prompt="test", stream=False)
        health_status["services"]["ollama"] = {
            "status": "healthy",
            "model": OLLAMA_MODEL
        }
    except Exception as e:
        logger.error(f"Ollama health check failed: {str(e)}")
        health_status["services"]["ollama"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        health_status["status"] = "degraded"
    
    # Check embedding model
    try:
        test_embedding = embedding_model.encode("test")
        health_status["services"]["embedding_model"] = {
            "status": "healthy",
            "embedding_dimension": len(test_embedding)
        }
    except Exception as e:
        logger.error(f"Embedding model health check failed: {str(e)}")
        health_status["services"]["embedding_model"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        health_status["status"] = "degraded"
    
    return health_status