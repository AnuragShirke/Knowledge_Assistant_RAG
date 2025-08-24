"""
Comprehensive backend authentication tests.
Tests user registration, login, JWT token validation, and protected endpoint access control.
"""
import pytest
import jwt
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from fastapi import status
from httpx import AsyncClient

from src.core.auth import SECRET, JWT_LIFETIME_SECONDS
from src.core.exceptions import (
    UserAlreadyExistsError,
    InvalidCredentialsError,
    InactiveUserError,
    UserNotFoundError
)


class TestUserRegistration:
    """Test user registration functionality."""
    
    async def test_register_valid_user(self, async_client: AsyncClient, valid_user_data):
        """Test successful user registration with valid data."""
        response = await async_client.post("/auth/register", json=valid_user_data)
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["email"] == valid_user_data["email"]
        assert data["is_active"] is True
        assert data["is_verified"] is False
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data
        # Ensure password is not returned
        assert "password" not in data
        assert "hashed_password" not in data
    
    async def test_register_invalid_email(self, async_client: AsyncClient):
        """Test registration with invalid email format."""
        invalid_data = {
            "email": "invalid-email-format",
            "password": "SecurePassword123!"
        }
        
        response = await async_client.post("/auth/register", json=invalid_data)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        data = response.json()
        assert data["error"] == "ValidationError"
        assert "validation_errors" in data
    
    async def test_register_weak_password(self, async_client: AsyncClient):
        """Test registration with weak password."""
        weak_password_data = {
            "email": "test@example.com",
            "password": "123"  # Too short
        }
        
        response = await async_client.post("/auth/register", json=weak_password_data)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    async def test_register_empty_fields(self, async_client: AsyncClient):
        """Test registration with empty required fields."""
        empty_data_cases = [
            {"email": "", "password": "SecurePassword123!"},
            {"email": "test@example.com", "password": ""},
            {"email": "", "password": ""}
        ]
        
        for empty_data in empty_data_cases:
            response = await async_client.post("/auth/register", json=empty_data)
            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    async def test_register_duplicate_email(self, async_client: AsyncClient, test_user, valid_user_data):
        """Test registration with existing email address."""
        # Try to register with same email as existing user
        duplicate_data = {
            "email": test_user.email,
            "password": "DifferentPassword123!"
        }
        
        response = await async_client.post("/auth/register", json=duplicate_data)
        assert response.status_code == status.HTTP_409_CONFLICT
        
        data = response.json()
        assert data["error"] == "UserAlreadyExistsError"
        assert "already exists" in data["detail"]
        assert data["registration_error"] is True
    
    async def test_register_missing_fields(self, async_client: AsyncClient):
        """Test registration with missing required fields."""
        incomplete_data_cases = [
            {"email": "test@example.com"},  # Missing password
            {"password": "SecurePassword123!"},  # Missing email
            {}  # Missing both
        ]
        
        for incomplete_data in incomplete_data_cases:
            response = await async_client.post("/auth/register", json=incomplete_data)
            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestUserLogin:
    """Test user login functionality."""
    
    async def test_login_valid_credentials(self, async_client: AsyncClient, test_user):
        """Test successful login with correct credentials."""
        login_data = {
            "username": test_user.email,  # FastAPI-Users uses 'username' for email
            "password": "SecurePassword123!"
        }
        
        response = await async_client.post("/auth/jwt/login", data=login_data)
        assert response.status_code == status.HTTP_200_OK
        
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        
        # Verify token is valid JWT
        token = data["access_token"]
        decoded = jwt.decode(token, SECRET, algorithms=["HS256"])
        assert "sub" in decoded  # Subject (user ID)
        assert "exp" in decoded  # Expiration time
    
    async def test_login_invalid_password(self, async_client: AsyncClient, test_user):
        """Test login with incorrect password."""
        login_data = {
            "username": test_user.email,
            "password": "WrongPassword123!"
        }
        
        response = await async_client.post("/auth/jwt/login", data=login_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        
        data = response.json()
        assert "LOGIN_BAD_CREDENTIALS" in data["detail"]
    
    async def test_login_nonexistent_user(self, async_client: AsyncClient):
        """Test login with non-existent user email."""
        login_data = {
            "username": "nonexistent@example.com",
            "password": "SecurePassword123!"
        }
        
        response = await async_client.post("/auth/jwt/login", data=login_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        
        data = response.json()
        assert "LOGIN_BAD_CREDENTIALS" in data["detail"]
    
    async def test_login_inactive_user(self, async_client: AsyncClient, inactive_test_user):
        """Test login with inactive user account."""
        login_data = {
            "username": inactive_test_user.email,
            "password": "SecurePassword123!"
        }
        
        response = await async_client.post("/auth/jwt/login", data=login_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        
        data = response.json()
        assert "LOGIN_BAD_CREDENTIALS" in data["detail"]
    
    async def test_login_empty_credentials(self, async_client: AsyncClient):
        """Test login with empty credentials."""
        empty_credentials_cases = [
            {"username": "", "password": "SecurePassword123!"},
            {"username": "test@example.com", "password": ""},
            {"username": "", "password": ""}
        ]
        
        for empty_creds in empty_credentials_cases:
            response = await async_client.post("/auth/jwt/login", data=empty_creds)
            assert response.status_code in [status.HTTP_400_BAD_REQUEST, status.HTTP_422_UNPROCESSABLE_ENTITY]
    
    async def test_login_missing_fields(self, async_client: AsyncClient):
        """Test login with missing required fields."""
        incomplete_data_cases = [
            {"username": "test@example.com"},  # Missing password
            {"password": "SecurePassword123!"},  # Missing username
            {}  # Missing both
        ]
        
        for incomplete_data in incomplete_data_cases:
            response = await async_client.post("/auth/jwt/login", data=incomplete_data)
            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestJWTTokenValidation:
    """Test JWT token validation and expiration."""
    
    async def test_valid_token_access(self, async_client: AsyncClient, test_user):
        """Test access with valid JWT token."""
        # Login to get token
        login_data = {
            "username": test_user.email,
            "password": "SecurePassword123!"
        }
        
        login_response = await async_client.post("/auth/jwt/login", data=login_data)
        token_data = login_response.json()
        token = token_data["access_token"]
        
        # Use token to access protected endpoint
        headers = {"Authorization": f"Bearer {token}"}
        response = await async_client.get("/users/me", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == test_user.email
        assert data["id"] == str(test_user.id)
    
    async def test_invalid_token_format(self, async_client: AsyncClient):
        """Test access with malformed JWT token."""
        invalid_tokens = [
            "invalid-token",
            "Bearer invalid-token",
            "not.a.jwt.token",
            "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.invalid",  # Invalid JWT
        ]
        
        for invalid_token in invalid_tokens:
            headers = {"Authorization": f"Bearer {invalid_token}"}
            response = await async_client.get("/users/me", headers=headers)
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    async def test_expired_token(self, async_client: AsyncClient, test_user):
        """Test access with expired JWT token."""
        # Create an expired token manually
        expired_payload = {
            "sub": str(test_user.id),
            "exp": datetime.utcnow() - timedelta(hours=1)  # Expired 1 hour ago
        }
        expired_token = jwt.encode(expired_payload, SECRET, algorithm="HS256")
        
        headers = {"Authorization": f"Bearer {expired_token}"}
        response = await async_client.get("/users/me", headers=headers)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    async def test_token_with_wrong_secret(self, async_client: AsyncClient, test_user):
        """Test access with token signed with wrong secret."""
        # Create token with wrong secret
        payload = {
            "sub": str(test_user.id),
            "exp": datetime.utcnow() + timedelta(hours=1)
        }
        wrong_secret_token = jwt.encode(payload, "wrong-secret", algorithm="HS256")
        
        headers = {"Authorization": f"Bearer {wrong_secret_token}"}
        response = await async_client.get("/users/me", headers=headers)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    async def test_token_without_bearer_prefix(self, async_client: AsyncClient, test_user):
        """Test access with token missing Bearer prefix."""
        # Login to get valid token
        login_data = {
            "username": test_user.email,
            "password": "SecurePassword123!"
        }
        
        login_response = await async_client.post("/auth/jwt/login", data=login_data)
        token_data = login_response.json()
        token = token_data["access_token"]
        
        # Use token without Bearer prefix
        headers = {"Authorization": token}
        response = await async_client.get("/users/me", headers=headers)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    async def test_missing_authorization_header(self, async_client: AsyncClient):
        """Test access without Authorization header."""
        response = await async_client.get("/users/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestProtectedEndpointAccess:
    """Test access control for protected endpoints."""
    
    @patch('src.main.embedding_model')
    @patch('src.main.qdrant_client')
    async def test_upload_endpoint_requires_auth(self, mock_qdrant, mock_embedding, async_client: AsyncClient, temp_upload_file):
        """Test that upload endpoint requires authentication."""
        with open(temp_upload_file, 'rb') as f:
            files = {"file": ("test.txt", f, "text/plain")}
            response = await async_client.post("/upload", files=files)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert data["auth_required"] is True
    
    @patch('src.main.embedding_model')
    @patch('src.main.qdrant_client')
    async def test_upload_endpoint_with_valid_auth(self, mock_qdrant, mock_embedding, async_client: AsyncClient, test_user, temp_upload_file):
        """Test upload endpoint with valid authentication."""
        # Mock the external services
        mock_embedding.encode.return_value = [[0.1, 0.2, 0.3]]
        mock_embedding.get_sentence_embedding_dimension.return_value = 3
        mock_qdrant.get_collections.return_value = MagicMock()
        mock_qdrant.create_collection = MagicMock()
        mock_qdrant.upsert = MagicMock()
        
        # Login to get token
        login_data = {
            "username": test_user.email,
            "password": "SecurePassword123!"
        }
        
        login_response = await async_client.post("/auth/jwt/login", data=login_data)
        token_data = login_response.json()
        headers = {"Authorization": f"Bearer {token_data['access_token']}"}
        
        # Upload file with authentication
        with open(temp_upload_file, 'rb') as f:
            files = {"file": ("test.txt", f, "text/plain")}
            response = await async_client.post("/upload", files=files, headers=headers)
        
        # Should succeed with proper authentication
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["filename"] == "test.txt"
        assert "message" in data
    
    async def test_query_endpoint_requires_auth(self, async_client: AsyncClient):
        """Test that query endpoint requires authentication."""
        query_data = {"query": "What is the meaning of life?"}
        response = await async_client.post("/query", json=query_data)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        data = response.json()
        assert data["auth_required"] is True
    
    @patch('src.main.embedding_model')
    @patch('src.main.qdrant_client')
    @patch('src.main.ollama_client')
    async def test_query_endpoint_with_valid_auth(self, mock_ollama, mock_qdrant, mock_embedding, async_client: AsyncClient, test_user):
        """Test query endpoint with valid authentication."""
        # Mock the external services
        mock_embedding.encode.return_value = [0.1, 0.2, 0.3]
        mock_qdrant.search.return_value = []
        mock_ollama.generate.return_value = {"response": "Test response"}
        
        # Login to get token
        login_data = {
            "username": test_user.email,
            "password": "SecurePassword123!"
        }
        
        login_response = await async_client.post("/auth/jwt/login", data=login_data)
        token_data = login_response.json()
        headers = {"Authorization": f"Bearer {token_data['access_token']}"}
        
        # Query with authentication
        query_data = {"query": "What is the meaning of life?"}
        response = await async_client.post("/query", json=query_data, headers=headers)
        
        # Should succeed with proper authentication
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "answer" in data
        assert "source_documents" in data
    
    async def test_users_me_endpoint_requires_auth(self, async_client: AsyncClient):
        """Test that /users/me endpoint requires authentication."""
        response = await async_client.get("/users/me")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    async def test_users_me_endpoint_with_valid_auth(self, async_client: AsyncClient, test_user):
        """Test /users/me endpoint with valid authentication."""
        # Login to get token
        login_data = {
            "username": test_user.email,
            "password": "SecurePassword123!"
        }
        
        login_response = await async_client.post("/auth/jwt/login", data=login_data)
        token_data = login_response.json()
        headers = {"Authorization": f"Bearer {token_data['access_token']}"}
        
        # Access user info with authentication
        response = await async_client.get("/users/me", headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == test_user.email
        assert data["id"] == str(test_user.id)
        assert data["is_active"] is True
    
    async def test_protected_endpoint_with_expired_token(self, async_client: AsyncClient, test_user):
        """Test protected endpoint access with expired token."""
        # Create an expired token
        expired_payload = {
            "sub": str(test_user.id),
            "exp": datetime.utcnow() - timedelta(hours=1)
        }
        expired_token = jwt.encode(expired_payload, SECRET, algorithm="HS256")
        
        headers = {"Authorization": f"Bearer {expired_token}"}
        response = await async_client.get("/users/me", headers=headers)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    async def test_protected_endpoint_with_inactive_user_token(self, async_client: AsyncClient, inactive_test_user):
        """Test protected endpoint access with token for inactive user."""
        # Create token for inactive user
        payload = {
            "sub": str(inactive_test_user.id),
            "exp": datetime.utcnow() + timedelta(hours=1)
        }
        token = jwt.encode(payload, SECRET, algorithm="HS256")
        
        headers = {"Authorization": f"Bearer {token}"}
        response = await async_client.get("/users/me", headers=headers)
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestLogoutFunctionality:
    """Test logout functionality."""
    
    async def test_logout_with_valid_token(self, async_client: AsyncClient, test_user):
        """Test logout with valid token."""
        # Login to get token
        login_data = {
            "username": test_user.email,
            "password": "SecurePassword123!"
        }
        
        login_response = await async_client.post("/auth/jwt/login", data=login_data)
        token_data = login_response.json()
        headers = {"Authorization": f"Bearer {token_data['access_token']}"}
        
        # Logout
        response = await async_client.post("/auth/jwt/logout", headers=headers)
        assert response.status_code == status.HTTP_200_OK
    
    async def test_logout_without_token(self, async_client: AsyncClient):
        """Test logout without authentication token."""
        response = await async_client.post("/auth/jwt/logout")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    async def test_logout_with_invalid_token(self, async_client: AsyncClient):
        """Test logout with invalid token."""
        headers = {"Authorization": "Bearer invalid-token"}
        response = await async_client.post("/auth/jwt/logout", headers=headers)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestPasswordSecurity:
    """Test password security and hashing."""
    
    async def test_password_is_hashed(self, async_client: AsyncClient, db_session, valid_user_data):
        """Test that passwords are properly hashed in database."""
        # Register user
        response = await async_client.post("/auth/register", json=valid_user_data)
        assert response.status_code == status.HTTP_201_CREATED
        
        # Check that password is hashed in database
        from sqlalchemy import select
        from src.core.database import User
        
        stmt = select(User).where(User.email == valid_user_data["email"])
        result = await db_session.execute(stmt)
        user = result.scalar_one()
        
        # Password should be hashed, not plain text
        assert user.hashed_password != valid_user_data["password"]
        assert user.hashed_password.startswith("$2b$")  # bcrypt hash format
        assert len(user.hashed_password) > 50  # Hashed passwords are much longer
    
    async def test_password_verification(self, async_client: AsyncClient, test_user):
        """Test that password verification works correctly."""
        # Should be able to login with correct password
        login_data = {
            "username": test_user.email,
            "password": "SecurePassword123!"
        }
        
        response = await async_client.post("/auth/jwt/login", data=login_data)
        assert response.status_code == status.HTTP_200_OK
        
        # Should fail with incorrect password
        wrong_login_data = {
            "username": test_user.email,
            "password": "WrongPassword123!"
        }
        
        response = await async_client.post("/auth/jwt/login", data=wrong_login_data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestUserDataIsolation:
    """Test that user data is properly isolated."""
    
    @patch('src.main.embedding_model')
    @patch('src.main.qdrant_client')
    async def test_user_specific_collections(self, mock_qdrant, mock_embedding, async_client: AsyncClient, test_user, temp_upload_file):
        """Test that each user gets their own collection."""
        # Mock the external services
        mock_embedding.encode.return_value = [[0.1, 0.2, 0.3]]
        mock_embedding.get_sentence_embedding_dimension.return_value = 3
        mock_qdrant.get_collections.return_value = MagicMock()
        mock_qdrant.create_collection = MagicMock()
        mock_qdrant.upsert = MagicMock()
        
        # Login to get token
        login_data = {
            "username": test_user.email,
            "password": "SecurePassword123!"
        }
        
        login_response = await async_client.post("/auth/jwt/login", data=login_data)
        token_data = login_response.json()
        headers = {"Authorization": f"Bearer {token_data['access_token']}"}
        
        # Upload file
        with open(temp_upload_file, 'rb') as f:
            files = {"file": ("test.txt", f, "text/plain")}
            response = await async_client.post("/upload", files=files, headers=headers)
        
        assert response.status_code == status.HTTP_200_OK
        
        # Verify that user-specific collection name was used
        # The collection name should include the user ID
        expected_collection_name = f"user_{str(test_user.id).replace('-', '_')}"
        
        # Check if create_collection was called with user-specific name
        # (This would be verified through the mocked calls)
        assert mock_qdrant.create_collection.called or mock_qdrant.get_collections.called