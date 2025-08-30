from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import shutil
import os
import logging
import traceback
import hashlib
import uuid
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from .core.processing_gemini import parse_document, chunk_text, get_embedding_model
from .core.vector_store import (
    get_qdrant_client, 
    create_collection_if_not_exists, 
    upsert_vectors, 
    search_vectors,
    get_user_collection_name
)

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import ensure_user_collection_exists separately to avoid any import issues
try:
    from .core.vector_store import ensure_user_collection_exists
    logger.info("Successfully imported ensure_user_collection_exists")
except ImportError as e:
    logger.error(f"Failed to import ensure_user_collection_exists: {e}")
    # Define a fallback function
    def ensure_user_collection_exists(client, user_id, vector_size):
        collection_name = f"user_{str(user_id).replace('-', '_')}"
        create_collection_if_not_exists(client, collection_name, vector_size)
        return collection_name
from .core.gemini_llm import get_gemini_client, format_prompt, generate_response
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

# Configure CORS
cors_origins = [
    "https://knowlege-assistant-frontend-9ixqvhqzr.vercel.app",
    "https://knowlege-assistant-frontend-bz7ttpgt9.vercel.app",
    "https://knowlege-assistant-frontend-me34gvxnc.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000"
]

# Add any additional origins from environment variable
env_origins = os.getenv("CORS_ORIGINS", "")
if env_origins:
    cors_origins.extend(env_origins.split(","))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Logger already configured above

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

@app.on_event("startup")
async def on_startup():
    """Initialize database on startup."""
    await create_db_and_tables()

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Knowledge Assistant RAG API",
        "status": "running",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "knowledge-assistant-api"
    }

@app.post("/upload", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session)
):
    """Upload and process a document."""
    try:
        # Validate file type
        allowed_types = ["pdf", "txt", "docx"]
        file_extension = file.filename.split(".")[-1].lower()
        
        if file_extension not in allowed_types:
            raise InvalidFileTypeError(f"File type {file_extension} not supported")
        
        # Save uploaded file temporarily
        temp_file_path = f"/tmp/{file.filename}"
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Parse document
        text_content = parse_document(temp_file_path, file_extension)
        
        if not text_content.strip():
            raise EmptyFileError("Document appears to be empty")
        
        # Chunk the text
        chunks = chunk_text(text_content)
        
        # Create document metadata
        file_hash = hashlib.md5(text_content.encode()).hexdigest()
        
        # Store in vector database (using Qdrant with memory storage for Railway)
        try:
            qdrant_client = get_qdrant_client()
            logger.info(f"Successfully initialized Qdrant client")
        except Exception as client_error:
            logger.error(f"Failed to initialize Qdrant client: {str(client_error)}")
            raise HTTPException(status_code=500, detail="Failed to initialize vector storage")
        
        # Get embedding model to determine vector size
        embedding_model = get_embedding_model()
        # For Gemini embeddings, the vector size is typically 768
        vector_size = 768
        
        # Debug logging
        logger.info(f"Creating collection for user {user.id} with vector size {vector_size}")
        
        # Ensure user collection exists with explicit parameters
        try:
            # Try the imported function first
            collection_name = ensure_user_collection_exists(qdrant_client, user.id, vector_size)
            logger.info(f"Successfully created/verified collection: {collection_name}")
        except TypeError as type_error:
            logger.error(f"Function signature error: {str(type_error)}")
            # Fallback: create collection manually
            collection_name = f"user_{str(user.id).replace('-', '_')}"
            try:
                create_collection_if_not_exists(qdrant_client, collection_name, vector_size)
                logger.info(f"Created fallback collection: {collection_name}")
            except Exception as fallback_error:
                logger.error(f"Fallback collection creation failed: {str(fallback_error)}")
                raise HTTPException(status_code=500, detail="Failed to initialize vector storage")
        except Exception as collection_error:
            logger.error(f"Failed to create user collection: {str(collection_error)}")
            # Fallback: create collection manually
            collection_name = f"user_{str(user.id).replace('-', '_')}"
            try:
                create_collection_if_not_exists(qdrant_client, collection_name, vector_size)
                logger.info(f"Created fallback collection: {collection_name}")
            except Exception as fallback_error:
                logger.error(f"Fallback collection creation failed: {str(fallback_error)}")
                raise HTTPException(status_code=500, detail="Failed to initialize vector storage")
        
        # For Railway deployment, we'll use a simplified approach
        # Store chunks with basic metadata
        document_id = f"{user.id}_{file.filename}_{file_hash[:8]}"
        
        # Generate embeddings and store chunks in vector database
        try:
            from .core.gemini_llm import get_embeddings
            
            # Generate embeddings for chunks
            embeddings = []
            payloads = []
            
            for i, chunk in enumerate(chunks):
                try:
                    # Get embedding for this chunk
                    embedding = get_embeddings([chunk])[0]  # get_embeddings returns a list
                    embeddings.append(embedding)
                    
                    # Create payload with metadata
                    payload = {
                        "text": chunk,
                        "document_id": document_id,
                        "chunk_index": i,
                        "filename": file.filename,
                        "user_id": str(user.id),
                        "file_hash": file_hash
                    }
                    payloads.append(payload)
                    
                except Exception as embedding_error:
                    logger.error(f"Failed to generate embedding for chunk {i}: {str(embedding_error)}")
                    continue
            
            # Store vectors in Qdrant
            if embeddings and payloads:
                try:
                    upsert_vectors(qdrant_client, collection_name, embeddings, payloads)
                    logger.info(f"Successfully stored {len(embeddings)} chunks in vector database")
                except Exception as storage_error:
                    logger.error(f"Failed to store vectors: {str(storage_error)}")
                    # Continue without failing the upload
            else:
                logger.warning("No embeddings generated, skipping vector storage")
                
        except Exception as vector_error:
            logger.error(f"Vector processing failed: {str(vector_error)}")
            # Continue without failing the upload
        
        # Clean up temp file
        os.remove(temp_file_path)
        
        return UploadResponse(
            filename=file.filename,
            message="Document uploaded and processed successfully",
            num_chunks_stored=len(chunks)
        )
        
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/query", response_model=QueryResponse)
async def query_documents(
    request: QueryRequest,
    user: User = Depends(current_active_user)
):
    """Query the knowledge base."""
    try:
        # Get Qdrant client and user collection
        try:
            qdrant_client = get_qdrant_client()
            collection_name = get_user_collection_name(user.id)
            
            # Generate embedding for the query
            from .core.gemini_llm import get_embeddings
            query_embedding = get_embeddings([request.query])[0]
            
            # Search for similar documents
            search_results = search_vectors(qdrant_client, collection_name, query_embedding, limit=5)
        except Exception as vector_error:
            logger.error(f"Vector search failed: {str(vector_error)}")
            search_results = []
        
        # Extract context from search results
        context = []
        sources = []
        
        for result in search_results:
            if hasattr(result, 'payload') and result.payload:
                context.append(result)
                sources.append({
                    "filename": result.payload.get("filename", "Unknown"),
                    "chunk_index": result.payload.get("chunk_index", 0),
                    "score": float(result.score) if hasattr(result, 'score') else 0.0
                })
        
        # Generate response using Gemini
        gemini_client = get_gemini_client()
        
        if context:
            prompt = format_prompt(request.query, context)
        else:
            # No relevant documents found
            prompt = f"""I don't have any relevant documents to answer your question: "{request.query}". 
            Please upload some documents first, or try a different question."""
        
        response = generate_response(gemini_client, prompt)
        
        return QueryResponse(
            answer=response,
            sources=sources,
            query=request.query,
            timestamp=datetime.utcnow().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Query error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Error handlers
@app.exception_handler(KnowledgeAssistantException)
async def knowledge_assistant_exception_handler(request: Request, exc: KnowledgeAssistantException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.error_type, "detail": exc.detail, "timestamp": exc.timestamp}
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": "validation_error", "message": "Invalid request data", "details": str(exc)}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "message": "An unexpected error occurred"}
    )