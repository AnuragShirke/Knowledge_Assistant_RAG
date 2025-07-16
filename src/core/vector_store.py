from qdrant_client import QdrantClient, models
import os

# --- Qdrant Client Initialization ---

def get_qdrant_client():
    """Initializes and returns the Qdrant client."""
    # Get Qdrant host from environment variable, default to localhost if not set
    host = os.environ.get("QDRANT_HOST", "localhost")
    client = QdrantClient(host=host, port=6333)
    return client

# --- Collection Management ---

def create_collection_if_not_exists(client: QdrantClient, collection_name: str, vector_size: int):
    """Creates a Qdrant collection if it doesn't already exist."""
    try:
        client.get_collection(collection_name=collection_name)
    except Exception: # If the collection does not exist, this will raise an exception
        client.create_collection(
            collection_name=collection_name,
            vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
        )

# --- Vector Operations ---

def upsert_vectors(client: QdrantClient, collection_name: str, vectors, payloads):
    """Upserts vectors and their payloads into the specified collection."""
    client.upsert(
        collection_name=collection_name,
        points=models.Batch(
            ids=list(range(len(vectors))),  # Generate sequential integer IDs
            vectors=vectors,
            payloads=payloads
        ),
        wait=True
    )

def search_vectors(client: QdrantClient, collection_name: str, query_vector, limit: int = 5):
    """Searches for similar vectors in the collection."""
    return client.search(
        collection_name=collection_name,
        query_vector=query_vector,
        limit=limit,
        with_payload=True
    )
