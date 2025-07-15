# Project Summary: Phases 1 & 2

This document summarizes the work completed in the first two phases of the RAG Knowledge Assistant project.

---

## Phase 1: Research & Setup

Phase 1 focused on establishing a fully containerized and automated local development environment.

### Key Achievements:

1.  **Project Structure:**
    -   `src/`: Contains all the Python source code for the backend API.
    -   `uploads/`: A directory for temporarily storing uploaded files during processing.
    -   `scripts/`: Holds utility scripts, such as the automated model puller for Ollama.

2.  **Dependency Management:**
    -   A `requirements.txt` file was created to manage all Python dependencies, including FastAPI, LangChain, Qdrant, and Sentence-Transformers.

3.  **Containerization with Docker:**
    -   A `Dockerfile` was written to create a container image for our FastAPI application.
    -   A `docker-compose.yml` file orchestrates all the necessary services:
        -   `backend`: Our FastAPI application.
        -   `qdrant`: The vector database for storing document embeddings.
        -   `ollama`: The service for running the open-source LLM.

4.  **Automated Model Pulling:**
    -   An entrypoint script (`scripts/ollama_entrypoint.sh`) was created to automatically pull the `llama3` model when the Ollama container starts. This ensures the LLM is ready without manual intervention.

---

## Phase 2: Backend API MVP

Phase 2 focused on building the core functionality of the knowledge assistant, resulting in a functional RAG pipeline accessible via a REST API.

### Key Achievements:

1.  **Modular Codebase:**
    -   The `src/core/` directory was created to organize the application's business logic into separate, manageable modules:
        -   `processing.py`: Handles PDF parsing, text chunking, and embedding model loading.
        -   `vector_store.py`: Manages all interactions with the Qdrant database (creation, upserting, searching).
        -   `llm.py`: Handles all interactions with the Ollama LLM service (prompt formatting, response generation).
        -   `models.py`: Defines the Pydantic models for API request and response data structures.

2.  **API Endpoints Implemented:**
    -   **`GET /health`**: A simple endpoint to confirm that the API is running.
    -   **`POST /upload`**: Implements the full document ingestion pipeline:
        1.  Receives and validates a PDF file.
        2.  Extracts text using `PyMuPDF`.
        3.  Splits the text into smaller, overlapping chunks using `LangChain`.
        4.  Generates vector embeddings for each chunk using `sentence-transformers`.
        5.  Upserts the chunks and their embeddings into the Qdrant database.
    -   **`POST /query`**: Implements the complete RAG pipeline to answer questions:
        1.  Receives a JSON object with a `query` string.
        2.  Generates an embedding for the query.
        3.  Searches Qdrant to retrieve the most relevant document chunks (Retrieval).
        4.  Constructs a detailed prompt containing the user's query and the retrieved context.
        5.  Sends the prompt to the `llama3` model via Ollama to get an answer (Augmented Generation).
        6.  Returns the generated answer along with the source documents used for context.
