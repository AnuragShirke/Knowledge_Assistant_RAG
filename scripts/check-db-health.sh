#!/bin/bash

# Database health check script for Knowledge Assistant RAG
# This script checks if the database is accessible and contains expected tables

set -e

DB_PATH="/app/data/knowledge_assistant.db"

echo "Checking database health..."

# Check if database file exists
if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: Database file not found at $DB_PATH"
    exit 1
fi

# Check if database is accessible and has expected tables
python3 -c "
import sqlite3
import sys

try:
    conn = sqlite3.connect('$DB_PATH')
    cursor = conn.cursor()
    
    # Check for users table
    cursor.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name='users';\")
    users_table = cursor.fetchone()
    
    # Check for documents table  
    cursor.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name='documents';\")
    documents_table = cursor.fetchone()
    
    # Check for alembic version table
    cursor.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version';\")
    alembic_table = cursor.fetchone()
    
    if users_table and documents_table and alembic_table:
        print('Database health check PASSED')
        print(f'Found required tables: users, documents, alembic_version')
        
        # Get current migration version
        cursor.execute(\"SELECT version_num FROM alembic_version;\")
        version = cursor.fetchone()
        if version:
            print(f'Current migration version: {version[0]}')
        
        conn.close()
        sys.exit(0)
    else:
        print('Database health check FAILED')
        print(f'Missing tables - users: {bool(users_table)}, documents: {bool(documents_table)}, alembic: {bool(alembic_table)}')
        conn.close()
        sys.exit(1)
        
except Exception as e:
    print(f'Database health check FAILED: {e}')
    sys.exit(1)
"