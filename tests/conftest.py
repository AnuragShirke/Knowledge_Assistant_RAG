"""
Test configuration and fixtures for authentication tests.
"""
import asyncio
import os
import pytest
import tempfile
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from src.main import app
from src.core.database import Base, get_async_session, get_user_db
from src.core.auth import get_user_manager
from src.core.schemas import UserCreate


# Test database URL - use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# Create test engine with special configuration for SQLite
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def test_db():
    """Create test database tables and clean up after tests."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session(test_db) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async with TestingSessionLocal() as session:
        yield session


@pytest.fixture
def override_get_async_session(db_session: AsyncSession):
    """Override the get_async_session dependency for testing."""
    async def _override_get_async_session():
        yield db_session
    return _override_get_async_session


@pytest.fixture
def test_client(override_get_async_session):
    """Create a test client with overridden dependencies."""
    app.dependency_overrides[get_async_session] = override_get_async_session
    
    # Mock external services for testing
    app.dependency_overrides["embedding_model"] = lambda: MagicMock()
    app.dependency_overrides["qdrant_client"] = lambda: MagicMock()
    app.dependency_overrides["ollama_client"] = lambda: MagicMock()
    
    with TestClient(app) as client:
        yield client
    
    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture
async def async_client(override_get_async_session):
    """Create an async test client with overridden dependencies."""
    app.dependency_overrides[get_async_session] = override_get_async_session
    
    # Mock external services for testing
    app.dependency_overrides["embedding_model"] = lambda: MagicMock()
    app.dependency_overrides["qdrant_client"] = lambda: MagicMock()
    app.dependency_overrides["ollama_client"] = lambda: MagicMock()
    
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
    
    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture
def valid_user_data():
    """Valid user registration data."""
    return {
        "email": "test@example.com",
        "password": "SecurePassword123!"
    }


@pytest.fixture
def invalid_user_data():
    """Invalid user registration data for testing validation."""
    return [
        {"email": "invalid-email", "password": "SecurePassword123!"},  # Invalid email
        {"email": "test@example.com", "password": "weak"},  # Weak password
        {"email": "", "password": "SecurePassword123!"},  # Empty email
        {"email": "test@example.com", "password": ""},  # Empty password
    ]


@pytest.fixture
def valid_login_data():
    """Valid login credentials."""
    return {
        "username": "test@example.com",  # FastAPI-Users uses 'username' field for email
        "password": "SecurePassword123!"
    }


@pytest.fixture
def invalid_login_data():
    """Invalid login credentials for testing."""
    return [
        {"username": "test@example.com", "password": "wrongpassword"},  # Wrong password
        {"username": "nonexistent@example.com", "password": "SecurePassword123!"},  # Non-existent user
        {"username": "", "password": "SecurePassword123!"},  # Empty username
        {"username": "test@example.com", "password": ""},  # Empty password
    ]


@pytest.fixture
async def test_user(db_session: AsyncSession):
    """Create a test user in the database."""
    from src.core.database import get_user_db
    from src.core.auth import get_user_manager
    
    user_db = get_user_db.__wrapped__(db_session)
    user_manager = get_user_manager.__wrapped__(user_db)
    
    user_create = UserCreate(
        email="test@example.com",
        password="SecurePassword123!"
    )
    
    user = await user_manager.create(user_create)
    await db_session.commit()
    return user


@pytest.fixture
async def inactive_test_user(db_session: AsyncSession):
    """Create an inactive test user in the database."""
    from src.core.database import get_user_db
    from src.core.auth import get_user_manager
    
    user_db = get_user_db.__wrapped__(db_session)
    user_manager = get_user_manager.__wrapped__(user_db)
    
    user_create = UserCreate(
        email="inactive@example.com",
        password="SecurePassword123!"
    )
    
    user = await user_manager.create(user_create)
    user.is_active = False
    await db_session.commit()
    return user


@pytest.fixture
async def auth_headers(test_client, test_user):
    """Get authentication headers for a test user."""
    login_data = {
        "username": test_user.email,
        "password": "SecurePassword123!"
    }
    
    response = test_client.post("/auth/jwt/login", data=login_data)
    assert response.status_code == 200
    
    token_data = response.json()
    return {"Authorization": f"Bearer {token_data['access_token']}"}


@pytest.fixture
def mock_external_services():
    """Mock external services for isolated testing."""
    return {
        "embedding_model": MagicMock(),
        "qdrant_client": MagicMock(),
        "ollama_client": MagicMock()
    }


@pytest.fixture
def temp_upload_file():
    """Create a temporary file for upload testing."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        f.write("This is test content for upload testing.")
        temp_path = f.name
    
    yield temp_path
    
    # Clean up
    if os.path.exists(temp_path):
        os.unlink(temp_path)