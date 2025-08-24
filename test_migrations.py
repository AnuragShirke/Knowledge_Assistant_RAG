#!/usr/bin/env python3
"""
Test script to verify database migrations work correctly.
This script tests the migration up/down functionality.
"""

import asyncio
import os
import sqlite3
from pathlib import Path

from src.core.database import create_db_and_tables, engine, Base


async def test_migration_up():
    """Test creating tables (migration up)"""
    print("Testing migration up (creating tables)...")
    
    # Remove existing database if it exists
    db_path = Path("knowledge_assistant.db")
    if db_path.exists():
        db_path.unlink()
    
    # Create tables
    await create_db_and_tables()
    
    # Verify tables exist
    conn = sqlite3.connect("knowledge_assistant.db")
    cursor = conn.cursor()
    
    # Check if users table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users';")
    users_table = cursor.fetchone()
    assert users_table is not None, "Users table was not created"
    print("✓ Users table created successfully")
    
    # Check if documents table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='documents';")
    documents_table = cursor.fetchone()
    assert documents_table is not None, "Documents table was not created"
    print("✓ Documents table created successfully")
    
    # Check users table structure
    cursor.execute("PRAGMA table_info(users);")
    users_columns = cursor.fetchall()
    expected_columns = ['id', 'email', 'hashed_password', 'is_active', 'is_superuser', 'is_verified', 'created_at', 'updated_at']
    actual_columns = [col[1] for col in users_columns]
    
    for expected_col in expected_columns:
        assert expected_col in actual_columns, f"Column {expected_col} missing from users table"
    print("✓ Users table has correct structure")
    
    # Check documents table structure
    cursor.execute("PRAGMA table_info(documents);")
    documents_columns = cursor.fetchall()
    expected_doc_columns = ['id', 'user_id', 'filename', 'original_size', 'chunks_count', 'upload_date', 'file_hash']
    actual_doc_columns = [col[1] for col in documents_columns]
    
    for expected_col in expected_doc_columns:
        assert expected_col in actual_doc_columns, f"Column {expected_col} missing from documents table"
    print("✓ Documents table has correct structure")
    
    # Check foreign key constraint
    cursor.execute("PRAGMA foreign_key_list(documents);")
    foreign_keys = cursor.fetchall()
    assert len(foreign_keys) > 0, "Foreign key constraint not found"
    assert foreign_keys[0][2] == 'users', "Foreign key does not reference users table"
    print("✓ Foreign key constraint exists")
    
    conn.close()
    print("Migration up test completed successfully!")


def test_migration_down():
    """Test dropping tables (migration down)"""
    print("\nTesting migration down (dropping tables)...")
    
    # Check if database exists
    db_path = Path("knowledge_assistant.db")
    if not db_path.exists():
        print("Database doesn't exist, skipping migration down test")
        return
    
    conn = sqlite3.connect("knowledge_assistant.db")
    cursor = conn.cursor()
    
    # Drop tables in reverse order (documents first due to foreign key)
    cursor.execute("DROP TABLE IF EXISTS documents;")
    cursor.execute("DROP TABLE IF EXISTS users;")
    conn.commit()
    
    # Verify tables are dropped
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'documents');")
    remaining_tables = cursor.fetchall()
    assert len(remaining_tables) == 0, "Tables were not dropped properly"
    print("✓ Tables dropped successfully")
    
    conn.close()
    print("Migration down test completed successfully!")


async def main():
    """Run all migration tests"""
    print("Starting database migration tests...\n")
    
    try:
        await test_migration_up()
        test_migration_down()
        print("\n🎉 All migration tests passed!")
    except Exception as e:
        print(f"\n❌ Migration test failed: {e}")
        raise
    finally:
        # Clean up
        db_path = Path("knowledge_assistant.db")
        if db_path.exists():
            db_path.unlink()
        print("Cleanup completed.")


if __name__ == "__main__":
    asyncio.run(main())