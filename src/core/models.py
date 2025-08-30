from pydantic import BaseModel, Field, validator
from typing import List, Dict, Any, Optional

class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="The query text to search for")
    
    @validator('query')
    def validate_query(cls, v):
        if not v.strip():
            raise ValueError('Query cannot be empty or contain only whitespace')
        return v.strip()

class SourceDocument(BaseModel):
    source: str
    text: str
    score: float

class QueryResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    query: str
    timestamp: str

class ErrorResponse(BaseModel):
    error: str
    detail: str
    status_code: int
    timestamp: Optional[str] = None

class UploadResponse(BaseModel):
    filename: str
    message: str
    num_chunks_stored: int
