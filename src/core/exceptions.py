"""
Custom exceptions for the Knowledge Assistant RAG application.
"""
from fastapi import HTTPException
from typing import Optional, Any, Dict
import datetime


class KnowledgeAssistantException(HTTPException):
    """Base exception class for Knowledge Assistant errors."""
    
    def __init__(
        self,
        status_code: int,
        detail: str,
        error_type: str = "KnowledgeAssistantError",
        headers: Optional[Dict[str, Any]] = None
    ):
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.error_type = error_type
        self.timestamp = datetime.datetime.utcnow().isoformat()


class FileProcessingError(KnowledgeAssistantException):
    """Raised when file processing fails."""
    
    def __init__(self, detail: str, filename: Optional[str] = None):
        error_detail = f"File processing failed: {detail}"
        if filename:
            error_detail = f"File processing failed for '{filename}': {detail}"
        super().__init__(
            status_code=422,
            detail=error_detail,
            error_type="FileProcessingError"
        )


class InvalidFileTypeError(KnowledgeAssistantException):
    """Raised when an unsupported file type is uploaded."""
    
    def __init__(self, file_extension: str, supported_types: list = None):
        if supported_types is None:
            supported_types = [".pdf", ".txt", ".docx"]
        
        detail = f"Invalid file type '{file_extension}'. Supported types: {', '.join(supported_types)}"
        super().__init__(
            status_code=400,
            detail=detail,
            error_type="InvalidFileTypeError"
        )


class EmptyFileError(KnowledgeAssistantException):
    """Raised when uploaded file is empty or contains no extractable text."""
    
    def __init__(self, filename: str):
        super().__init__(
            status_code=400,
            detail=f"File '{filename}' is empty or contains no extractable text",
            error_type="EmptyFileError"
        )


class VectorStoreError(KnowledgeAssistantException):
    """Raised when vector store operations fail."""
    
    def __init__(self, detail: str, operation: str = "unknown"):
        super().__init__(
            status_code=503,
            detail=f"Vector store operation '{operation}' failed: {detail}",
            error_type="VectorStoreError"
        )


class LLMError(KnowledgeAssistantException):
    """Raised when LLM operations fail."""
    
    def __init__(self, detail: str):
        super().__init__(
            status_code=503,
            detail=f"Language model error: {detail}",
            error_type="LLMError"
        )


class QueryValidationError(KnowledgeAssistantException):
    """Raised when query validation fails."""
    
    def __init__(self, detail: str):
        super().__init__(
            status_code=400,
            detail=f"Query validation failed: {detail}",
            error_type="QueryValidationError"
        )


class ServiceUnavailableError(KnowledgeAssistantException):
    """Raised when external services are unavailable."""
    
    def __init__(self, service_name: str, detail: str = ""):
        error_detail = f"Service '{service_name}' is unavailable"
        if detail:
            error_detail += f": {detail}"
        super().__init__(
            status_code=503,
            detail=error_detail,
            error_type="ServiceUnavailableError"
        )


class AuthenticationError(KnowledgeAssistantException):
    """Raised when authentication fails."""
    
    def __init__(self, detail: str = "Authentication failed"):
        super().__init__(
            status_code=401,
            detail=detail,
            error_type="AuthenticationError"
        )


class AuthorizationError(KnowledgeAssistantException):
    """Raised when authorization fails."""
    
    def __init__(self, detail: str = "Access denied"):
        super().__init__(
            status_code=403,
            detail=detail,
            error_type="AuthorizationError"
        )


class TokenExpiredError(AuthenticationError):
    """Raised when JWT token has expired."""
    
    def __init__(self, detail: str = "Token has expired"):
        super().__init__(detail=detail)
        self.error_type = "TokenExpiredError"


class InvalidTokenError(AuthenticationError):
    """Raised when JWT token is invalid or malformed."""
    
    def __init__(self, detail: str = "Invalid token"):
        super().__init__(detail=detail)
        self.error_type = "InvalidTokenError"


class UserNotFoundError(AuthenticationError):
    """Raised when user is not found during authentication."""
    
    def __init__(self, detail: str = "User not found"):
        super().__init__(detail=detail)
        self.error_type = "UserNotFoundError"


class InvalidCredentialsError(AuthenticationError):
    """Raised when login credentials are invalid."""
    
    def __init__(self, detail: str = "Invalid email or password"):
        super().__init__(detail=detail)
        self.error_type = "InvalidCredentialsError"


class UserAlreadyExistsError(KnowledgeAssistantException):
    """Raised when attempting to register with existing email."""
    
    def __init__(self, email: str):
        super().__init__(
            status_code=409,
            detail=f"User with email '{email}' already exists",
            error_type="UserAlreadyExistsError"
        )


class InactiveUserError(AuthorizationError):
    """Raised when user account is inactive."""
    
    def __init__(self, detail: str = "User account is inactive"):
        super().__init__(detail=detail)
        self.error_type = "InactiveUserError"