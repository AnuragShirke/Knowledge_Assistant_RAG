import uuid
from typing import Optional

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.exceptions import UserAlreadyExists, UserNotExists

from .database import User, get_user_db
from .exceptions import (
    UserAlreadyExistsError,
    UserNotFoundError,
    InvalidCredentialsError,
    InactiveUserError
)

import os
import logging

logger = logging.getLogger(__name__)

# JWT Configuration
SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-here")  # Use environment variable
JWT_LIFETIME_SECONDS = int(os.getenv("JWT_LIFETIME_SECONDS", "3600"))  # 1 hour default


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    """User manager for handling user operations with custom exception handling"""
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        """Called after user registration"""
        logger.info(f"User {user.id} ({user.email}) has registered successfully.")

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        """Called after forgot password request"""
        logger.info(f"User {user.id} ({user.email}) has requested password reset.")

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        """Called after verification request"""
        logger.info(f"Verification requested for user {user.id} ({user.email}).")

    async def create(self, user_create, safe: bool = False, request: Optional[Request] = None):
        """Override create method to handle custom exceptions"""
        try:
            return await super().create(user_create, safe=safe, request=request)
        except UserAlreadyExists:
            logger.warning(f"Registration attempt with existing email: {user_create.email}")
            raise UserAlreadyExistsError(user_create.email)

    async def authenticate(self, credentials):
        """Override authenticate method to handle custom exceptions"""
        try:
            user = await super().authenticate(credentials)
            if user is None:
                logger.warning(f"Authentication failed for email: {credentials.username}")
                raise InvalidCredentialsError()
            if not user.is_active:
                logger.warning(f"Authentication attempt for inactive user: {credentials.username}")
                raise InactiveUserError()
            logger.info(f"User {user.email} authenticated successfully.")
            return user
        except UserNotExists:
            logger.warning(f"Authentication attempt for non-existent user: {credentials.username}")
            raise UserNotFoundError()
        except Exception as e:
            logger.error(f"Unexpected error during authentication: {str(e)}")
            raise InvalidCredentialsError("Authentication failed due to server error")


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    """Get user manager instance"""
    yield UserManager(user_db)


# JWT Authentication Strategy
def get_jwt_strategy() -> JWTStrategy:
    """Get JWT strategy for authentication"""
    return JWTStrategy(secret=SECRET, lifetime_seconds=JWT_LIFETIME_SECONDS)


# Bearer Transport (for JWT tokens in Authorization header)
bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")

# Authentication Backend
auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

# FastAPI Users instance
fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager,
    [auth_backend],
)

# Current user dependencies
current_active_user = fastapi_users.current_user(active=True)
current_superuser = fastapi_users.current_user(active=True, superuser=True)