import fitz  # PyMuPDF
from langchain.text_splitter import RecursiveCharacterTextSplitter
import docx  # Added for docx parsing
import os

def parse_pdf(file_path: str) -> str:
    """Extracts text from a PDF file."""
    doc = fitz.open(file_path)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text

def parse_txt(file_path: str) -> str:
    """Extracts text from a TXT file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()
    return text

def parse_docx(file_path: str) -> str:
    """Extracts text from a DOCX file."""
    doc = docx.Document(file_path)
    text = ""
    for paragraph in doc.paragraphs:
        text += paragraph.text + "\n"
    return text

def parse_document(file_path: str, file_type: str) -> str:
    """Parse document based on file type."""
    if file_type == "pdf":
        return parse_pdf(file_path)
    elif file_type == "txt":
        return parse_txt(file_path)
    elif file_type == "docx":
        return parse_docx(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")

def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> list:
    """Split text into chunks using LangChain's text splitter."""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
    )
    chunks = text_splitter.split_text(text)
    return chunks

def get_embedding_model():
    """Return None since we're using Gemini API for embeddings."""
    # This function is kept for compatibility but returns None
    # since we're using Gemini API for embeddings
    return None