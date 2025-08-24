#!/bin/bash

# Script to run authentication tests for both backend and frontend

echo "🔐 Running Authentication Tests"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${2}${1}${NC}"
}

# Check if we're in the right directory
if [ ! -f "requirements.txt" ]; then
    print_status "❌ Error: Please run this script from the Knowledge_Assistant_RAG directory" $RED
    exit 1
fi

print_status "📋 Test Summary:" $YELLOW
echo "  - Backend authentication tests (Python/pytest)"
echo "  - Frontend authentication tests (TypeScript/Vitest)"
echo ""

# Backend Tests
print_status "🐍 Running Backend Authentication Tests..." $YELLOW
echo "=============================================="

# Check if pytest is installed
if ! python -m pytest --version > /dev/null 2>&1; then
    print_status "Installing pytest and dependencies..." $YELLOW
    pip install pytest pytest-asyncio httpx pytest-mock
fi

# Run backend tests
if python -m pytest tests/test_auth_backend.py -v --tb=short; then
    print_status "✅ Backend authentication tests passed!" $GREEN
    BACKEND_SUCCESS=true
else
    print_status "❌ Backend authentication tests failed!" $RED
    BACKEND_SUCCESS=false
fi

echo ""

# Frontend Tests
print_status "⚛️  Running Frontend Authentication Tests..." $YELLOW
echo "=============================================="

# Change to frontend directory
cd rag-quest-hub

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    print_status "Installing frontend dependencies..." $YELLOW
    npm install
fi

# Run frontend tests
if npm run test -- --run src/test/auth-frontend.test.tsx src/test/auth-integration.test.tsx; then
    print_status "✅ Frontend authentication tests passed!" $GREEN
    FRONTEND_SUCCESS=true
else
    print_status "❌ Frontend authentication tests failed!" $RED
    FRONTEND_SUCCESS=false
fi

# Return to root directory
cd ..

echo ""
print_status "📊 Test Results Summary:" $YELLOW
echo "========================="

if [ "$BACKEND_SUCCESS" = true ]; then
    print_status "✅ Backend Tests: PASSED" $GREEN
else
    print_status "❌ Backend Tests: FAILED" $RED
fi

if [ "$FRONTEND_SUCCESS" = true ]; then
    print_status "✅ Frontend Tests: PASSED" $GREEN
else
    print_status "❌ Frontend Tests: FAILED" $RED
fi

echo ""

# Overall result
if [ "$BACKEND_SUCCESS" = true ] && [ "$FRONTEND_SUCCESS" = true ]; then
    print_status "🎉 All authentication tests passed!" $GREEN
    exit 0
else
    print_status "💥 Some authentication tests failed!" $RED
    exit 1
fi