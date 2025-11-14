# scripts/preload_model.py
from sentence_transformers import SentenceTransformer
import os

# The model name is hardcoded to match the one in src/core/processing.py
MODEL_NAME = 'all-MiniLM-L6-v2'

def main():
    """
    Downloads and caches the sentence-transformer model during the build process.
    This prevents a long startup delay on the deployed server.
    """
    print(f"--- Pre-loading sentence-transformer model: {MODEL_NAME} ---")
    
    # By instantiating the model, the library will download and cache it.
    # The cache path is typically ~/.cache/torch/sentence_transformers/
    try:
        SentenceTransformer(MODEL_NAME)
        print(f"--- Model '{MODEL_NAME}' pre-loading complete. ---")
    except Exception as e:
        print(f"Error pre-loading model: {e}")
        # We exit with a non-zero code to fail the build if the download fails.
        exit(1)

if __name__ == "__main__":
    main()
