from qdrant_client import QdrantClient, models
import os
import uuid
import logging

logger = logging.getLogger(__name__)

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
        logger.info(f"Collection '{collection_name}' already exists")
    except Exception: # If the collection does not exist, this will raise an exception
        client.create_collection(
            collection_name=collection_name,
            vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
        )
        logger.info(f"Created new collection '{collection_name}'")

# --- User-Specific Collection Management ---

def get_user_collection_name(user_id: uuid.UUID) -> str:
    """
    Generate a user-specific collection name.
    
    Args:
        user_id: The user's UUID
        
    Returns:
        Collection name in format 'user_{user_id_without_hyphens}'
    """
    # Convert UUID to string and remove hyphens for valid collection name
    user_id_str = str(user_id).replace('-', '_')
    return f"user_{user_id_str}"

def ensure_user_collection_exists(client: QdrantClient, user_id: uuid.UUID, vector_size: int) -> str:
    """
    Ensure that a user-specific collection exists in Qdrant.
    
    Args:
        client: Qdrant client instance
        user_id: The user's UUID
        vector_size: Size of the embedding vectors
        
    Returns:
        The collection name that was created or verified
    """
    collection_name = get_user_collection_name(user_id)
    
    try:
        # Check if collection exists
        client.get_collection(collection_name=collection_name)
        logger.info(f"User collection '{collection_name}' already exists for user {user_id}")
    except Exception:
        # Collection doesn't exist, create it
        try:
            client.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(size=vector_size, distance=models.Distance.COSINE),
            )
            logger.info(f"Created new user collection '{collection_name}' for user {user_id}")
        except Exception as e:
            logger.error(f"Failed to create collection '{collection_name}' for user {user_id}: {str(e)}")
            raise
    
    return collection_name

def collection_exists(client: QdrantClient, collection_name: str) -> bool:
    """
    Check if a collection exists in Qdrant.
    
    Args:
        client: Qdrant client instance
        collection_name: Name of the collection to check
        
    Returns:
        True if collection exists, False otherwise
    """
    try:
        client.get_collection(collection_name=collection_name)
        return True
    except Exception:
        return False

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
    """
    Searches for similar vectors in the collection.
    
    Args:
        client: Qdrant client instance
        collection_name: Name of the collection to search
        query_vector: Query vector for similarity search
        limit: Maximum number of results to return
        
    Returns:
        Search results, or empty list if collection doesn't exist or is empty
    """
    try:
        # Check if collection exists first
        if not collection_exists(client, collection_name):
            logger.warning(f"Collection '{collection_name}' does not exist")
            return []
        
        # Check if collection has any points
        collection_info = client.get_collection(collection_name)
        if collection_info.points_count == 0:
            logger.info(f"Collection '{collection_name}' is empty")
            return []
        
        # Perform the search
        results = client.search(
            collection_name=collection_name,
            query_vector=query_vector,
            limit=limit,
            with_payload=True
        )
        
        logger.info(f"Found {len(results)} results in collection '{collection_name}'")
        return results
        
    except Exception as e:
        logger.error(f"Error searching collection '{collection_name}': {str(e)}")
        return []

def get_collection_info(client: QdrantClient, collection_name: str) -> dict:
    """
    Get information about a collection.
    
    Args:
        client: Qdrant client instance
        collection_name: Name of the collection
        
    Returns:
        Dictionary with collection information or None if collection doesn't exist
    """
    try:
        collection_info = client.get_collection(collection_name)
        return {
            "name": collection_name,
            "points_count": collection_info.points_count,
            "status": collection_info.status,
            "vectors_count": collection_info.vectors_count if hasattr(collection_info, 'vectors_count') else None
        }
    except Exception as e:
        logger.error(f"Error getting collection info for '{collection_name}': {str(e)}")
        return None
