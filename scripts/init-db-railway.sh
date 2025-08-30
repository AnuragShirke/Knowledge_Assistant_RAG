#!/bin/bash

# Railway-specific database initialization script
set -e

echo "Starting Railway database initialization..."

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

# Check if alembic command is available
if ! command -v alembic &> /dev/null; then
    echo "Alembic command not found in PATH. Trying python -m alembic instead..."
    # Test if alembic module is available
    if python -c "import alembic" 2>/dev/null; then
        echo "Alembic module found, using python -m alembic"
        ALEMBIC_CMD="python -m alembic"
    else
        echo "Alembic module not found. Trying to install..."
        pip install alembic
        ALEMBIC_CMD="python -m alembic"
    fi
else
    ALEMBIC_CMD="alembic"
fi

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

# Create test user for demo purposes
echo "Creating test user..."
if python create-test-user.py; then
    echo "Test user setup completed."
else
    echo "Test user setup failed, but continuing..."
fi

# Start the FastAPI server using Railway-specific main
echo "Starting FastAPI server with Railway configuration..."
PORT=${PORT:-8000}
exec uvicorn src.main_railway:app --host 0.0.0.0 --port $PORT --log-level info