#!/usr/bin/env python3
"""
Script to create a test user for Railway deployment
"""
import asyncio
import os
import sys
from pathlib import Path

# Add the src directory to the Python path
sys.path.insert(0, str(Path(__file__).parent))

from src.core.database import get_async_session, create_db_and_tables
from src.core.auth import get_user_manager
from src.models.user import UserCreate
from fastapi_users.exceptions import UserAlreadyExists

async def create_test_user():
    """Create a test user for the application"""
    
    # Ensure database is initialized
    await create_db_and_tables()
    
    # Get database session
    async for session in get_async_session():
        try:
            # Get user manager
            user_manager = get_user_manager()
            
            # Create test user
            user_create = UserCreate(
                email="demo@example.com",
                password="demopassword",
                is_verified=True
            )
            
            # Try to create the user
            try:
                user = await user_manager.create(user_create)
                print(f"✅ Test user created successfully: {user.email}")
                print(f"   User ID: {user.id}")
                print(f"   Is Active: {user.is_active}")
                print(f"   Is Verified: {user.is_verified}")
                
            except UserAlreadyExists:
                print("ℹ️  Test user already exists: demo@example.com")
                
                # Try to get the existing user
                existing_user = await user_manager.get_by_email("demo@example.com")
                print(f"   User ID: {existing_user.id}")
                print(f"   Is Active: {existing_user.is_active}")
                print(f"   Is Verified: {existing_user.is_verified}")
                
        except Exception as e:
            print(f"❌ Error creating test user: {e}")
            import traceback
            traceback.print_exc()
        
        break  # Exit after first session

if __name__ == "__main__":
    # Set environment variables if not set
    if not os.getenv("DATABASE_URL"):
        os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./data/knowledge_assistant.db"
    
    if not os.getenv("JWT_SECRET"):
        os.environ["JWT_SECRET"] = "your-secret-key-here-change-in-production"
    
    # Create data directory
    os.makedirs("data", exist_ok=True)
    
    print("Creating test user for Railway deployment...")
    asyncio.run(create_test_user())