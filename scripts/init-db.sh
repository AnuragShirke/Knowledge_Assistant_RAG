#!/bin/bash

# Database initialization script for Knowledge Assistant RAG
# This script runs database migrations and starts the FastAPI server

set -e

echo "Starting database initialization..."

# Create data directory if it doesn't exist
mkdir -p /app/data

# Set proper permissions for data directory
chmod 755 /app/data

# Validate required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "Warning: DATABASE_URL not set, using default SQLite path"
    export DATABASE_URL="sqlite+aiosqlite:///./data/knowledge_assistant.db"
fi

if [ -z "$JWT_SECRET" ]; then
    echo "Error: JWT_SECRET environment variable is required"
    exit 1
fi

echo "Database URL: $DATABASE_URL"

# Try to run database migrations
echo "Running database migrations..."
cd /app

# Always use python -m for robustness
ALEMBIC_CMD="python -m alembic"

# Check if alembic.ini exists
if [ ! -f "alembic.ini" ]; then
    echo "Error: alembic.ini not found. Database migrations cannot proceed."
    echo "Skipping migrations and starting server..."
else
    # Try to run migrations with timeout
    echo "Attempting to run migrations..."
    if timeout 60 $ALEMBIC_CMD upgrade head; then
        echo "Database migrations completed successfully."
    else
        echo "Database migrations failed or timed out. Continuing anyway..."
        echo "The application will create tables automatically if needed."
    fi
fi

# Start the FastAPI server
echo "Starting FastAPI server..."
PORT=${PORT:-8000}
exec python -m uvicorn src.main:app --host 0.0.0.0 --port $PORT --log-level info