from fastapi import FastAPI, UploadFile, File, HTTPException
import shutil
import os
from .core.processing import parse_pdf, chunk_text, get_embedding_model
from .core.vector_store import get_qdrant_client, create_collection_if_not_exists, upsert_vectors, search_vectors
from .core.llm import get_ollama_client, format_prompt, generate_response
from .core.models import QueryRequest, QueryResponse

app = FastAPI()

# --- Constants ---
UPLOADS_DIR = "uploads"
QDRANT_COLLECTION_NAME = "knowledge_base"
OLLAMA_MODEL = "llama3"

# --- Application Startup ---
# Create uploads directory if it doesn't exist
if not os.path.exists(UPLOADS_DIR):
    os.makedirs(UPLOADS_DIR)

# Load models and clients on startup
embedding_model = get_embedding_model()
qdrant_client = get_qdrant_client()
ollama_client = get_ollama_client()

# Get the size of the embeddings from the model
embedding_size = embedding_model.get_sentence_embedding_dimension()

# Create the Qdrant collection if it doesn't exist
create_collection_if_not_exists(qdrant_client, QDRANT_COLLECTION_NAME, embedding_size)

# --- API Endpoints ---
@app.post("/upload")
def upload_file(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDFs are supported.")

    file_path = os.path.join(UPLOADS_DIR, file.filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {e}")
        
    try:
        text = parse_pdf(file_path)
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from the PDF.")

        chunks = chunk_text(text)
        embeddings = embedding_model.encode(chunks)
        payloads = [{"text": chunk, "source": file.filename} for chunk in chunks]

        upsert_vectors(qdrant_client, QDRANT_COLLECTION_NAME, embeddings, payloads)

    except Exception as e:
        os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Error processing and storing file: {e}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

    return {
        "filename": file.filename,
        "message": f"Successfully uploaded, processed, and stored.",
        "num_chunks_stored": len(chunks)
    }

@app.post("/query", response_model=QueryResponse)
def query_knowledge_base(request: QueryRequest):
    try:
        # 1. Embed the user's query
        query_embedding = embedding_model.encode(request.query)

        # 2. Search for relevant documents in Qdrant
        search_results = search_vectors(
            client=qdrant_client,
            collection_name=QDRANT_COLLECTION_NAME,
            query_vector=query_embedding,
            limit=3  # Retrieve top 3 most relevant chunks
        )

        # 3. Format the prompt for the LLM
        prompt = format_prompt(request.query, search_results)

        # 4. Generate a response from the LLM
        answer = generate_response(ollama_client, OLLAMA_MODEL, prompt)

        # 5. Extract source documents for citation
        source_documents = [
            {
                "source": result.payload["source"],
                "text": result.payload["text"],
                "score": result.score
            }
            for result in search_results
        ]

        return QueryResponse(answer=answer, source_documents=source_documents)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error during query: {e}")

@app.get("/health")
def health_check():
    return {"status": "ok"}
