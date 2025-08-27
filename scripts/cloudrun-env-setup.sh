#!/bin/bash

# Cloud Run Environment Setup Script
# This script helps set up environment variables and secrets for Cloud Run deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to generate secure JWT secret
generate_jwt_secret() {
    openssl rand -base64 64 | tr -d '\n'
}

# Function to validate Gemini API key format
validate_gemini_key() {
    local key="$1"
    if [[ ${#key} -lt 20 ]]; then
        return 1
    fi
    return 0
}

# Function to create environment file
create_env_file() {
    local env_file="$1"
    
    print_status "Creating Cloud Run environment file: $env_file"
    
    # Get project ID from gcloud
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
    if [[ -z "$PROJECT_ID" ]]; then
        read -p "Enter your Google Cloud Project ID: " PROJECT_ID
    fi
    
    # Generate JWT secret
    JWT_SECRET=$(generate_jwt_secret)
    print_success "Generated secure JWT secret"
    
    # Get Gemini API key
    read -p "Enter your Google Gemini API key: " GEMINI_API_KEY
    if ! validate_gemini_key "$GEMINI_API_KEY"; then
        print_warning "API key seems short. Please ensure it's correct."
    fi
    
    # Create the environment file
    cat > "$env_file" << EOF
# Cloud Run Environment Variables
# Generated on $(date)

# Google Cloud Project Configuration
PROJECT_ID=$PROJECT_ID
REGION=us-central1

# JWT Configuration (Auto-generated secure secret)
JWT_SECRET=$JWT_SECRET
JWT_LIFETIME_SECONDS=3600

# User Registration Settings
USER_REGISTRATION_ENABLED=true
EMAIL_VERIFICATION_REQUIRED=false

# Frontend Configuration (will be updated after deployment)
VITE_API_BASE_URL=https://knowledge-assistant-backend-HASH-uc.a.run.app
VITE_API_TIMEOUT=30000
VITE_ENABLE_REGISTRATION=true

# CORS Configuration (will be updated after deployment)
CORS_ORIGINS=https://knowledge-assistant-frontend-HASH-uc.a.run.app

# Google Gemini API Configuration
GEMINI_API_KEY=$GEMINI_API_KEY
GEMINI_MODEL=gemini-1.5-flash

# Database Configuration (will be generated during deployment)
DATABASE_URL=postgresql+asyncpg://knowledge-assistant-user:PASSWORD@/knowledge-assistant-main-db?host=/cloudsql/$PROJECT_ID:us-central1:knowledge-assistant-db

# Qdrant Configuration (will be updated after deployment)
QDRANT_HOST=https://knowledge-assistant-qdrant-HASH-uc.a.run.app
QDRANT_PORT=443

# Python Configuration
PYTHONUNBUFFERED=1
PYTHONDONTWRITEBYTECODE=1

# Cloud SQL Instance Connection
CLOUD_SQL_CONNECTION_NAME=$PROJECT_ID:us-central1:knowledge-assistant-db

# Service Account Emails
BACKEND_SERVICE_ACCOUNT=knowledge-assistant-backend-sa@$PROJECT_ID.iam.gserviceaccount.com
QDRANT_SERVICE_ACCOUNT=knowledge-assistant-qdrant-sa@$PROJECT_ID.iam.gserviceaccount.com

# Resource Configuration
BACKEND_MEMORY=1Gi
BACKEND_CPU=1000m
FRONTEND_MEMORY=512Mi
FRONTEND_CPU=1000m
QDRANT_MEMORY=512Mi
QDRANT_CPU=1000m

# Scaling Configuration
MAX_INSTANCES=10
MIN_INSTANCES=0
QDRANT_MIN_INSTANCES=1

# Security Configuration
REQUIRE_AUTHENTICATION=false
ENABLE_CORS=true
SECURE_COOKIES=true
EOF
    
    print_success "Environment file created: $env_file"
    print_warning "Please review and modify the file as needed before deployment"
}

# Function to update service URLs after deployment
update_service_urls() {
    local env_file="$1"
    
    if [[ ! -f "$env_file" ]]; then
        print_error "Environment file not found: $env_file"
        exit 1
    fi
    
    source "$env_file"
    
    print_status "Updating service URLs in environment file..."
    
    # Get actual service URLs
    FRONTEND_URL=$(gcloud run services describe knowledge-assistant-frontend --region="$REGION" --format="value(status.url)" 2>/dev/null || echo "")
    BACKEND_URL=$(gcloud run services describe knowledge-assistant-backend --region="$REGION" --format="value(status.url)" 2>/dev/null || echo "")
    QDRANT_URL=$(gcloud run services describe knowledge-assistant-qdrant --region="$REGION" --format="value(status.url)" 2>/dev/null || echo "")
    
    if [[ -n "$FRONTEND_URL" && -n "$BACKEND_URL" && -n "$QDRANT_URL" ]]; then
        # Update the environment file with actual URLs
        sed -i "s|VITE_API_BASE_URL=.*|VITE_API_BASE_URL=$BACKEND_URL|" "$env_file"
        sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=$FRONTEND_URL|" "$env_file"
        sed -i "s|QDRANT_HOST=.*|QDRANT_HOST=$QDRANT_URL|" "$env_file"
        
        print_success "Updated service URLs:"
        print_success "  Frontend: $FRONTEND_URL"
        print_success "  Backend: $BACKEND_URL"
        print_success "  Qdrant: $QDRANT_URL"
    else
        print_warning "Some services not found. URLs not updated."
    fi
}

# Function to validate environment file
validate_env_file() {
    local env_file="$1"
    
    if [[ ! -f "$env_file" ]]; then
        print_error "Environment file not found: $env_file"
        return 1
    fi
    
    source "$env_file"
    
    print_status "Validating environment configuration..."
    
    local errors=0
    
    # Check required variables
    if [[ -z "$PROJECT_ID" ]]; then
        print_error "PROJECT_ID is not set"
        ((errors++))
    fi
    
    if [[ -z "$JWT_SECRET" ]]; then
        print_error "JWT_SECRET is not set"
        ((errors++))
    fi
    
    if [[ -z "$GEMINI_API_KEY" ]]; then
        print_error "GEMINI_API_KEY is not set"
        ((errors++))
    fi
    
    # Validate JWT secret strength
    if [[ ${#JWT_SECRET} -lt 32 ]]; then
        print_warning "JWT_SECRET is shorter than recommended (32+ characters)"
    fi
    
    # Validate Gemini API key
    if ! validate_gemini_key "$GEMINI_API_KEY"; then
        print_warning "GEMINI_API_KEY format may be invalid"
    fi
    
    if [[ $errors -eq 0 ]]; then
        print_success "Environment validation passed"
        return 0
    else
        print_error "Environment validation failed with $errors errors"
        return 1
    fi
}

# Function to create secrets in Secret Manager
create_secrets() {
    local env_file="$1"
    
    if [[ ! -f "$env_file" ]]; then
        print_error "Environment file not found: $env_file"
        exit 1
    fi
    
    source "$env_file"
    
    print_status "Creating secrets in Google Secret Manager..."
    
    # Create the secret if it doesn't exist
    if ! gcloud secrets describe knowledge-assistant-secrets &>/dev/null; then
        gcloud secrets create knowledge-assistant-secrets --replication-policy="automatic"
        print_success "Created secret: knowledge-assistant-secrets"
    else
        print_warning "Secret already exists, will update with new version"
    fi
    
    # Create temporary secrets file
    local temp_secrets="/tmp/cloudrun-secrets-$$.json"
    cat > "$temp_secrets" << EOF
{
  "JWT_SECRET": "$JWT_SECRET",
  "DATABASE_URL": "$DATABASE_URL",
  "GEMINI_API_KEY": "$GEMINI_API_KEY"
}
EOF
    
    # Add secret version
    gcloud secrets versions add knowledge-assistant-secrets --data-file="$temp_secrets"
    
    # Clean up
    rm "$temp_secrets"
    
    print_success "Secrets created/updated in Secret Manager"
}

# Main function
main() {
    local command="${1:-}"
    local env_file="${2:-$(dirname "$0")/../.env.cloudrun}"
    
    case "$command" in
        "create")
            create_env_file "$env_file"
            ;;
        "validate")
            validate_env_file "$env_file"
            ;;
        "update-urls")
            update_service_urls "$env_file"
            ;;
        "create-secrets")
            validate_env_file "$env_file" && create_secrets "$env_file"
            ;;
        "")
            print_status "Cloud Run Environment Setup Utility"
            echo ""
            echo "Usage: $0 <command> [env_file]"
            echo ""
            echo "Commands:"
            echo "  create        - Create new environment file"
            echo "  validate      - Validate existing environment file"
            echo "  update-urls   - Update service URLs after deployment"
            echo "  create-secrets - Create secrets in Secret Manager"
            echo ""
            echo "Default env_file: .env.cloudrun"
            ;;
        *)
            print_error "Unknown command: $command"
            exit 1
            ;;
    esac
}

main "$@"