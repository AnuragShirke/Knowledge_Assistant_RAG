import fitz  # PyMuPDF
from langchain.text_splitter import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
import docx # Added for docx parsing

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
    document = docx.Document(file_path)
    text = []
    for paragraph in document.paragraphs:
        text.append(paragraph.text)
    return '\n'.join(text)

def parse_document(file_path: str, file_extension: str) -> str:
    """Dispatches to the correct parser based on file extension."""
    if file_extension == ".pdf":
        return parse_pdf(file_path)
    elif file_extension == ".txt":
        return parse_txt(file_path)
    elif file_extension == ".docx":
        return parse_docx(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_extension}")

def chunk_text(text: str) -> list[str]:
    """Splits text into smaller chunks."""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len
    )
    return text_splitter.split_text(text)

def get_embedding_model(model_name: str = 'all-MiniLM-L6-v2'):
    """Loads the sentence-transformer model."""
    return SentenceTransformer(model_name)