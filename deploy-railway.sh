#!/bin/bash

# Railway Deployment Script for Knowledge Assistant RAG
# This script automates the deployment process to Railway.app

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="knowledge-assistant-rag"
BACKEND_SERVICE="backend"
FRONTEND_SERVICE="frontend"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if Railway CLI is installed
check_railway_cli() {
    log "Checking Railway CLI installation..."
    if ! command -v railway &> /dev/null; then
        error "Railway CLI is not installed. Please install it first:"
        echo "  npm install -g @railway/cli"
        echo "  or"
        echo "  curl -fsSL https://railway.app/install.sh | sh"
        exit 1
    fi
    success "Railway CLI is installed"
}

# Check if user is logged in to Railway
check_railway_auth() {
    log "Checking Railway authentication..."
    if ! railway whoami &> /dev/null; then
        error "Not logged in to Railway. Please login first:"
        echo "  railway login"
        exit 1
    fi
    success "Authenticated with Railway"
}

# Validate environment variables
validate_environment() {
    log "Validating environment variables..."
    
    if [ ! -f ".env.railway" ]; then
        warning ".env.railway file not found. Creating from template..."
        if [ -f ".env.railway.template" ]; then
            cp .env.railway.template .env.railway
            warning "Please edit .env.railway with your configuration before continuing."
            read -p "Press Enter after editing .env.railway..."
        else
            error ".env.railway.template not found. Please create environment configuration."
            exit 1
        fi
    fi
    
    # Source environment variables
    source .env.railway
    
    # Check required variables
    if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your-super-secret-jwt-key-change-in-production-minimum-32-chars" ]; then
        error "JWT_SECRET must be set to a secure value (32+ characters)"
        exit 1
    fi
    
    if [ ${#JWT_SECRET} -lt 32 ]; then
        error "JWT_SECRET must be at least 32 characters long"
        exit 1
    fi
    
    success "Environment variables validated"
}

# Create or connect to Railway project
setup_railway_project() {
    log "Setting up Railway project..."
    
    # Check if already in a Railway project
    if railway status &> /dev/null; then
        log "Already connected to a Railway project"
        return
    fi
    
    # Ask user if they want to create new project or connect to existing
    echo "Choose an option:"
    echo "1) Create new Railway project"
    echo "2) Connect to existing Railway project"
    read -p "Enter choice (1 or 2): " choice
    
    case $choice in
        1)
            log "Creating new Railway project..."
            railway new "$PROJECT_NAME"
            ;;
        2)
            log "Connecting to existing Railway project..."
            railway link
            ;;
        *)
            error "Invalid choice"
            exit 1
            ;;
    esac
    
    success "Railway project setup complete"
}

# Deploy backend service
deploy_backend() {
    log "Deploying backend service..."
    
    # Check if backend service exists
    if ! railway service list | grep -q "$BACKEND_SERVICE"; then
        log "Creating backend service..."
        railway service create "$BACKEND_SERVICE"
    fi
    
    # Switch to backend service
    railway service use "$BACKEND_SERVICE"
    
    # Set environment variables
    log "Setting backend environment variables..."
    source .env.railway
    
    railway variables set JWT_SECRET="$JWT_SECRET"
    railway variables set JWT_LIFETIME_SECONDS="$JWT_LIFETIME_SECONDS"
    railway variables set USER_REGISTRATION_ENABLED="$USER_REGISTRATION_ENABLED"
    railway variables set EMAIL_VERIFICATION_REQUIRED="$EMAIL_VERIFICATION_REQUIRED"
    railway variables set DATABASE_URL="$DATABASE_URL"
    railway variables set CORS_ORIGINS="$CORS_ORIGINS"
    railway variables set PYTHONUNBUFFERED="1"
    railway variables set PYTHONDONTWRITEBYTECODE="1"
    
    # Set external service variables if using managed services
    if [ -n "$QDRANT_CLOUD_URL" ]; then
        railway variables set QDRANT_CLOUD_URL="$QDRANT_CLOUD_URL"
        railway variables set QDRANT_API_KEY="$QDRANT_API_KEY"
    else
        railway variables set QDRANT_HOST="$QDRANT_HOST"
        railway variables set QDRANT_PORT="$QDRANT_PORT"
    fi
    
    if [ -n "$OPENAI_API_KEY" ]; then
        railway variables set OPENAI_API_KEY="$OPENAI_API_KEY"
        railway variables set USE_OPENAI_INSTEAD_OF_OLLAMA="$USE_OPENAI_INSTEAD_OF_OLLAMA"
    else
        railway variables set OLLAMA_HOST="$OLLAMA_HOST"
        railway variables set OLLAMA_PORT="$OLLAMA_PORT"
        railway variables set OLLAMA_MODEL="$OLLAMA_MODEL"
    fi
    
    # Deploy backend
    log "Deploying backend code..."
    railway up --detach
    
    success "Backend deployment initiated"
}

# Deploy frontend service
deploy_frontend() {
    log "Deploying frontend service..."
    
    # Get backend URL
    railway service use "$BACKEND_SERVICE"
    BACKEND_URL=$(railway domain | head -n1)
    
    if [ -z "$BACKEND_URL" ]; then
        warning "Backend URL not available yet. You may need to set VITE_API_BASE_URL manually later."
        BACKEND_URL="https://your-backend.railway.app"
    else
        BACKEND_URL="https://$BACKEND_URL"
    fi
    
    # Switch to frontend directory
    cd rag-quest-hub
    
    # Check if frontend service exists
    if ! railway service list | grep -q "$FRONTEND_SERVICE"; then
        log "Creating frontend service..."
        railway service create "$FRONTEND_SERVICE"
    fi
    
    # Switch to frontend service
    railway service use "$FRONTEND_SERVICE"
    
    # Set frontend environment variables
    log "Setting frontend environment variables..."
    railway variables set VITE_API_BASE_URL="$BACKEND_URL"
    railway variables set VITE_API_TIMEOUT="$VITE_API_TIMEOUT"
    railway variables set VITE_ENABLE_REGISTRATION="$VITE_ENABLE_REGISTRATION"
    
    # Deploy frontend
    log "Deploying frontend code..."
    railway up --detach
    
    # Return to project root
    cd ..
    
    success "Frontend deployment initiated"
}

# Add PostgreSQL database (optional)
add_postgresql() {
    log "Checking if PostgreSQL should be added..."
    
    if [[ "$DATABASE_URL" == *"postgresql"* ]]; then
        log "PostgreSQL configuration detected. Adding PostgreSQL service..."
        railway add postgresql
        success "PostgreSQL service added"
    else
        log "Using SQLite database (no PostgreSQL needed)"
    fi
}

# Wait for deployments and perform health checks
wait_and_health_check() {
    log "Waiting for deployments to complete..."
    
    # Wait a bit for deployments to start
    sleep 30
    
    # Check backend health
    log "Checking backend health..."
    railway service use "$BACKEND_SERVICE"
    BACKEND_URL=$(railway domain | head -n1)
    
    if [ -n "$BACKEND_URL" ]; then
        BACKEND_URL="https://$BACKEND_URL"
        log "Backend URL: $BACKEND_URL"
        
        # Wait for backend to be ready (up to 5 minutes)
        for i in {1..30}; do
            if curl -f "$BACKEND_URL/health" &> /dev/null; then
                success "Backend health check passed"
                break
            fi
            log "Waiting for backend to be ready... (attempt $i/30)"
            sleep 10
        done
    else
        warning "Backend URL not available for health check"
    fi
    
    # Check frontend health
    log "Checking frontend health..."
    railway service use "$FRONTEND_SERVICE"
    FRONTEND_URL=$(railway domain | head -n1)
    
    if [ -n "$FRONTEND_URL" ]; then
        FRONTEND_URL="https://$FRONTEND_URL"
        log "Frontend URL: $FRONTEND_URL"
        
        # Wait for frontend to be ready (up to 3 minutes)
        for i in {1..18}; do
            if curl -f "$FRONTEND_URL" &> /dev/null; then
                success "Frontend health check passed"
                break
            fi
            log "Waiting for frontend to be ready... (attempt $i/18)"
            sleep 10
        done
    else
        warning "Frontend URL not available for health check"
    fi
}

# Display deployment summary
show_deployment_summary() {
    log "Deployment Summary"
    echo "===================="
    
    railway service use "$BACKEND_SERVICE"
    BACKEND_URL=$(railway domain | head -n1)
    
    railway service use "$FRONTEND_SERVICE"
    FRONTEND_URL=$(railway domain | head -n1)
    
    if [ -n "$BACKEND_URL" ]; then
        echo "Backend URL:  https://$BACKEND_URL"
        echo "Health Check: https://$BACKEND_URL/health"
        echo "API Docs:     https://$BACKEND_URL/docs"
    fi
    
    if [ -n "$FRONTEND_URL" ]; then
        echo "Frontend URL: https://$FRONTEND_URL"
    fi
    
    echo ""
    echo "Next Steps:"
    echo "1. Test the application functionality"
    echo "2. Update CORS_ORIGINS if needed"
    echo "3. Configure custom domain (optional)"
    echo "4. Set up monitoring and alerts"
    echo ""
    echo "Useful Commands:"
    echo "  railway logs --service $BACKEND_SERVICE   # View backend logs"
    echo "  railway logs --service $FRONTEND_SERVICE  # View frontend logs"
    echo "  railway status                            # Check deployment status"
    echo "  railway variables                         # View environment variables"
}

# Rollback function
rollback_deployment() {
    error "Deployment failed. Rolling back..."
    
    # This is a basic rollback - in a real scenario, you might want to
    # revert to previous deployment or clean up failed services
    warning "Manual cleanup may be required. Check Railway dashboard."
    
    exit 1
}

# Main deployment function
main() {
    log "Starting Railway deployment for Knowledge Assistant RAG"
    
    # Trap errors and rollback
    trap rollback_deployment ERR
    
    # Pre-deployment checks
    check_railway_cli
    check_railway_auth
    validate_environment
    
    # Setup and deploy
    setup_railway_project
    add_postgresql
    deploy_backend
    deploy_frontend
    
    # Post-deployment verification
    wait_and_health_check
    show_deployment_summary
    
    success "Railway deployment completed successfully!"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Railway Deployment Script for Knowledge Assistant RAG"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --backend-only Deploy only the backend service"
        echo "  --frontend-only Deploy only the frontend service"
        echo ""
        echo "Prerequisites:"
        echo "  1. Railway CLI installed and authenticated"
        echo "  2. .env.railway file configured"
        echo "  3. Docker images optimized"
        echo ""
        exit 0
        ;;
    --backend-only)
        log "Deploying backend service only"
        check_railway_cli
        check_railway_auth
        validate_environment
        setup_railway_project
        add_postgresql
        deploy_backend
        success "Backend deployment completed!"
        ;;
    --frontend-only)
        log "Deploying frontend service only"
        check_railway_cli
        check_railway_auth
        validate_environment
        setup_railway_project
        deploy_frontend
        success "Frontend deployment completed!"
        ;;
    "")
        # No arguments - run full deployment
        main
        ;;
    *)
        error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac