import ollama
import os

# --- Ollama Client Initialization ---

def get_ollama_client():
    """Initializes and returns the Ollama client."""
    host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
    return ollama.Client(host=host)

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

def generate_response(client: ollama.Client, model: str, prompt: str):
    """Generates a response from the LLM."""
    response = client.chat(
        model=model,
        messages=[{"role": "user", "content": prompt}]
    )
    return response['message']['content']
