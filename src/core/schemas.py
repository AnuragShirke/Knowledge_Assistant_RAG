import uuid
from typing import Optional
from fastapi_users import schemas
from pydantic import BaseModel, EmailStr
from datetime import datetime


class UserRead(schemas.BaseUser[uuid.UUID]):
    """User schema for reading user data"""
    created_at: datetime
    updated_at: datetime


class UserCreate(schemas.BaseUserCreate):
    """User schema for creating new users"""
    email: EmailStr
    password: str


class UserUpdate(schemas.BaseUserUpdate):
    """User schema for updating user data"""
    password: Optional[str] = None
    email: Optional[EmailStr] = None


class DocumentMetadataRead(BaseModel):
    """Document metadata schema for reading"""
    id: uuid.UUID
    filename: str
    original_size: Optional[int]
    chunks_count: Optional[int]
    upload_date: datetime
    file_hash: Optional[str]
    
    class Config:
        from_attributes = True


class DocumentMetadataCreate(BaseModel):
    """Document metadata schema for creation"""
    filename: str
    original_size: Optional[int] = None
    chunks_count: Optional[int] = None
    file_hash: Optional[str] = None