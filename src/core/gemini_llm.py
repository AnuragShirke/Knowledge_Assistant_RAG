import google.generativeai as genai
import os
import logging

logger = logging.getLogger(__name__)

# --- Gemini Client Initialization ---

def get_gemini_client():
    """Initializes and returns the Gemini client."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")
    
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')
    return model

# --- Prompt Generation ---

def format_prompt(query: str, context: list[dict]) -> str:
    """Formats the prompt for the LLM with the retrieved context."""
    context_str = "\n".join([item.payload.get('text') for item in context])
    prompt = f"""**Instruction**:
Answer the user's query based *only* on the provided context.
If the context does not contain the answer, state that you cannot answer the question with the given information.
Do not use any prior knowledge.

**Context**:
{context_str}

**Query**:
{query}

**Answer**:
"""
    return prompt

# --- LLM Interaction ---

def generate_response(client, prompt: str):
    """Generates a response from the Gemini LLM."""
    try:
        response = client.generate_content(prompt)
        return response.text
    except Exception as e:
        logger.error(f"Gemini API error: {str(e)}")
        raise Exception(f"Failed to generate response: {str(e)}")

# --- Embedding Functions ---

def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts using Gemini."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")
    
    genai.configure(api_key=api_key)
    
    embeddings = []
    for text in texts:
        try:
            # Use Gemini's embedding model
            result = genai.embed_content(
                model="models/embedding-001",
                content=text,
                task_type="retrieval_document"
            )
            embeddings.append(result['embedding'])
        except Exception as e:
            logger.error(f"Failed to generate embedding for text: {str(e)}")
            # Return a zero vector as fallback
            embeddings.append([0.0] * 768)  # Gemini embeddings are 768-dimensional
    
    return embeddings