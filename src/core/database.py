import uuid
from datetime import datetime
from typing import AsyncGenerator

from fastapi import Depends
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyUserDatabase
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.declarative import DeclarativeMeta, declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy import String as SQLString

DATABASE_URL = "sqlite+aiosqlite:///./knowledge_assistant.db"

Base: DeclarativeMeta = declarative_base()


class GUID(TypeDecorator):
    """Platform-independent GUID type.
    Uses PostgreSQL's UUID type, otherwise uses CHAR(36), storing as stringified hex values.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == 'postgresql':
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                return str(uuid.UUID(value))
            else:
                return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(value)
            return value


class User(SQLAlchemyBaseUserTableUUID, Base):
    """User model extending FastAPI-Users base table"""
    __tablename__ = "users"
    
    # Override id column to use our GUID type for SQLite compatibility
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    
    # Additional fields beyond the base user table
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DocumentMetadata(Base):
    """Document metadata model for tracking user uploads"""
    __tablename__ = "documents"
    
    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_size = Column(Integer)
    chunks_count = Column(Integer)
    upload_date = Column(DateTime, default=datetime.utcnow)
    file_hash = Column(String(64), unique=True)  # Prevent duplicate uploads
    
    # Relationship to user
    user = relationship("User", back_populates="documents")


# Add relationship to User model
User.documents = relationship("DocumentMetadata", back_populates="user", cascade="all, delete-orphan")


# Database engine and session configuration
engine = create_async_engine(DATABASE_URL)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


async def create_db_and_tables():
    """Create database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session"""
    async with async_session_maker() as session:
        yield session


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    """Get user database instance for FastAPI-Users"""
    yield SQLAlchemyUserDatabase(session, User)