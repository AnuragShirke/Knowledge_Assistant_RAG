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

---

## Development Log (Continuous)

This section tracks the detailed implementation steps and troubleshooting throughout the project.

1.  **Initial Scaffolding**: Created `requirements.txt` and a basic FastAPI app in `src/main.py`.
2.  **Containerization**: Wrote a `Dockerfile` for the backend and a `docker-compose.yml` to orchestrate the `backend`, `qdrant`, and `ollama` services.
3.  **Code Modularization**: Refactored the application logic into a `src/core` directory with distinct modules for `processing.py`, `vector_store.py`, `llm.py`, and `models.py`.
4.  **Ingestion Pipeline (`/upload`)**: Implemented the full document ingestion flow: PDF parsing -> Text Chunking -> Embedding -> Storage in Qdrant.
5.  **RAG Pipeline (`/query`)**: Implemented the query flow: Query Embedding -> Vector Search -> Prompt Formatting -> LLM Generation -> Response with Sources.
6.  **Automation & Troubleshooting**:
    -   **Automated Model Pulling**: Created `scripts/ollama_entrypoint.sh` to automatically check for the server and pull the `llama3` model on startup, removing a manual setup step.
    -   **Fixed `curl` Dependency**: Added `curl` installation to the Ollama entrypoint script to resolve a `command not found` error.
    -   **Fixed Service Race Condition**: Created `scripts/wait-for-qdrant.sh` and updated the backend's entrypoint in `docker-compose.yml` to ensure the backend waits for Qdrant to be healthy before starting. This fixed a `timed out` connection error.

---

## How to Test the Backend MVP

You can interact with the API using `curl` in your terminal.

**Step 1: Start the Services**

Open your terminal in the project's root directory and run:

```bash
docker-compose up --build
```

This will build the images and start all three services. The first time you run this, it will take a few minutes to download the `llama3` model. You can monitor the logs to see the progress.

**Step 2: Test the `/upload` Endpoint**

Once the services are running, use the following `curl` command to upload a PDF file. Replace `"/path/to/your/document.pdf"` with the actual path to your file.

```bash
curl -X POST -F "file=@/path/to/your/document.pdf" http://localhost:8000/upload
```

*   **Expected Response**: A JSON object confirming the upload was successful.
    ```json
    {"filename":"document.pdf","message":"Successfully uploaded, processed, and stored.","num_chunks_stored":25}
    ```

**Step 3: Test the `/query` Endpoint**

After uploading a document, you can ask questions about its content. Replace `"Your question about the document"` with your query.

```bash
curl -X POST -H "Content-Type: application/json" \
-d '{"query": "Your question about the document"}' \
http://localhost:8000/query
```

*   **Expected Response**: A JSON object containing the LLM's answer and the source document chunks used to generate it.
    ```json
    {
      "answer": "This is the answer generated by the LLM based on the document.",
      "source_documents": [
        {
          "source": "document.pdf",
          "text": "A relevant chunk of text from the source document...",
          "score": 0.91
        }
      ]
    }
    ```