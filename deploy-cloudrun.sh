#!/bin/bash

# Cloud Run Deployment Script for Knowledge Assistant
# This script automates the deployment of the Knowledge Assistant application to Google Cloud Run

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.cloudrun"
REGION="us-central1"

# Function to print colored output
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

# Function to check if required tools are installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it from https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to load environment variables
load_environment() {
    if [[ -f "$ENV_FILE" ]]; then
        print_status "Loading environment variables from $ENV_FILE"
        source "$ENV_FILE"
    else
        print_error "Environment file $ENV_FILE not found. Please copy .env.cloudrun.template to .env.cloudrun and configure it."
        exit 1
    fi
    
    # Validate required variables
    if [[ -z "$PROJECT_ID" ]]; then
        print_error "PROJECT_ID is not set in environment file"
        exit 1
    fi
    
    print_success "Environment variables loaded"
}

# Function to authenticate and set project
setup_gcloud() {
    print_status "Setting up gcloud configuration..."
    
    # Set the project
    gcloud config set project "$PROJECT_ID"
    
    # Enable required APIs
    print_status "Enabling required Google Cloud APIs..."
    gcloud services enable \
        cloudbuild.googleapis.com \
        run.googleapis.com \
        containerregistry.googleapis.com \
        sqladmin.googleapis.com \
        secretmanager.googleapis.com \
        iam.googleapis.com
    
    print_success "gcloud setup completed"
}

# Function to create secrets
create_secrets() {
    print_status "Creating secrets in Secret Manager..."
    
    # Check if secret already exists
    if gcloud secrets describe knowledge-assistant-secrets &>/dev/null; then
        print_warning "Secret knowledge-assistant-secrets already exists, skipping creation"
    else
        gcloud secrets create knowledge-assistant-secrets --replication-policy="automatic"
        print_success "Created secret: knowledge-assistant-secrets"
    fi
    
    # Create temporary secrets file
    cat > /tmp/secrets.json << EOF
{
  "JWT_SECRET": "${JWT_SECRET}",
  "DATABASE_URL": "${DATABASE_URL}",
  "GEMINI_API_KEY": "${GEMINI_API_KEY}"
}
EOF
    
    # Add secret version
    gcloud secrets versions add knowledge-assistant-secrets --data-file=/tmp/secrets.json
    
    # Clean up temporary file
    rm /tmp/secrets.json
    
    print_success "Secrets created and configured"
}

# Function to create service accounts
create_service_accounts() {
    print_status "Creating service accounts..."
    
    # Backend service account
    if gcloud iam service-accounts describe "knowledge-assistant-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com" &>/dev/null; then
        print_warning "Backend service account already exists, skipping creation"
    else
        gcloud iam service-accounts create knowledge-assistant-backend-sa \
            --display-name="Knowledge Assistant Backend Service Account" \
            --description="Service account for Knowledge Assistant backend"
        print_success "Created backend service account"
    fi
    
    # Qdrant service account
    if gcloud iam service-accounts describe "knowledge-assistant-qdrant-sa@${PROJECT_ID}.iam.gserviceaccount.com" &>/dev/null; then
        print_warning "Qdrant service account already exists, skipping creation"
    else
        gcloud iam service-accounts create knowledge-assistant-qdrant-sa \
            --display-name="Knowledge Assistant Qdrant Service Account" \
            --description="Service account for Qdrant vector database"
        print_success "Created qdrant service account"
    fi
    
    # Grant IAM roles
    print_status "Granting IAM roles..."
    
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:knowledge-assistant-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/cloudsql.client"
    
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:knowledge-assistant-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor"
    
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:knowledge-assistant-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/run.invoker"
    
    print_success "Service accounts and IAM roles configured"
}

# Function to create Cloud SQL instance
create_cloud_sql() {
    print_status "Creating Cloud SQL instance..."
    
    # Check if instance already exists
    if gcloud sql instances describe knowledge-assistant-db &>/dev/null; then
        print_warning "Cloud SQL instance already exists, skipping creation"
    else
        gcloud sql instances create knowledge-assistant-db \
            --database-version=POSTGRES_15 \
            --tier=db-f1-micro \
            --region="$REGION" \
            --storage-type=HDD \
            --storage-size=10GB \
            --storage-auto-increase \
            --storage-auto-increase-limit=20GB \
            --backup-start-time=03:00 \
            --maintenance-window-day=SUN \
            --maintenance-window-hour=04 \
            --maintenance-release-channel=production
        
        print_success "Created Cloud SQL instance"
    fi
    
    # Create database
    if gcloud sql databases describe knowledge-assistant-main-db --instance=knowledge-assistant-db &>/dev/null; then
        print_warning "Database already exists, skipping creation"
    else
        gcloud sql databases create knowledge-assistant-main-db --instance=knowledge-assistant-db
        print_success "Created database"
    fi
    
    # Create user (password will be generated)
    DB_PASSWORD=$(openssl rand -base64 32)
    if gcloud sql users describe knowledge-assistant-user --instance=knowledge-assistant-db &>/dev/null; then
        print_warning "Database user already exists, updating password"
        gcloud sql users set-password knowledge-assistant-user \
            --instance=knowledge-assistant-db \
            --password="$DB_PASSWORD"
    else
        gcloud sql users create knowledge-assistant-user \
            --instance=knowledge-assistant-db \
            --password="$DB_PASSWORD"
        print_success "Created database user"
    fi
    
    # Update DATABASE_URL in secrets
    CONNECTION_NAME="${PROJECT_ID}:${REGION}:knowledge-assistant-db"
    NEW_DATABASE_URL="postgresql+asyncpg://knowledge-assistant-user:${DB_PASSWORD}@/knowledge-assistant-main-db?host=/cloudsql/${CONNECTION_NAME}"
    
    # Update secrets with new database URL
    cat > /tmp/secrets.json << EOF
{
  "JWT_SECRET": "${JWT_SECRET}",
  "DATABASE_URL": "${NEW_DATABASE_URL}",
  "GEMINI_API_KEY": "${GEMINI_API_KEY}"
}
EOF
    
    gcloud secrets versions add knowledge-assistant-secrets --data-file=/tmp/secrets.json
    rm /tmp/secrets.json
    
    print_success "Cloud SQL setup completed"
}

# Function to build and push Docker images
build_and_push_images() {
    print_status "Building and pushing Docker images..."
    
    # Build backend image
    print_status "Building backend image..."
    docker build -t "gcr.io/${PROJECT_ID}/knowledge-assistant-backend:latest" \
        -f "${SCRIPT_DIR}/Dockerfile" "${SCRIPT_DIR}"
    
    # Build frontend image
    print_status "Building frontend image..."
    docker build -t "gcr.io/${PROJECT_ID}/knowledge-assistant-frontend:latest" \
        -f "${SCRIPT_DIR}/rag-quest-hub/Dockerfile" "${SCRIPT_DIR}/rag-quest-hub"
    
    # Configure Docker for GCR
    gcloud auth configure-docker
    
    # Push images
    print_status "Pushing backend image..."
    docker push "gcr.io/${PROJECT_ID}/knowledge-assistant-backend:latest"
    
    print_status "Pushing frontend image..."
    docker push "gcr.io/${PROJECT_ID}/knowledge-assistant-frontend:latest"
    
    print_success "Docker images built and pushed"
}

# Function to deploy services
deploy_services() {
    print_status "Deploying services to Cloud Run..."
    
    # Deploy Qdrant service first
    print_status "Deploying Qdrant service..."
    gcloud run deploy knowledge-assistant-qdrant \
        --image=qdrant/qdrant:latest \
        --platform=managed \
        --region="$REGION" \
        --memory=512Mi \
        --cpu=1 \
        --max-instances=5 \
        --min-instances=1 \
        --port=6333 \
        --service-account="knowledge-assistant-qdrant-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --set-env-vars="QDRANT__SERVICE__HTTP_PORT=6333,QDRANT__SERVICE__GRPC_PORT=6334" \
        --allow-unauthenticated
    
    # Get Qdrant service URL
    QDRANT_URL=$(gcloud run services describe knowledge-assistant-qdrant --region="$REGION" --format="value(status.url)")
    print_success "Qdrant deployed at: $QDRANT_URL"
    
    # Deploy backend service
    print_status "Deploying backend service..."
    gcloud run deploy knowledge-assistant-backend \
        --image="gcr.io/${PROJECT_ID}/knowledge-assistant-backend:latest" \
        --platform=managed \
        --region="$REGION" \
        --memory=1Gi \
        --cpu=1 \
        --max-instances=10 \
        --min-instances=0 \
        --port=8000 \
        --service-account="knowledge-assistant-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
        --add-cloudsql-instances="${PROJECT_ID}:${REGION}:knowledge-assistant-db" \
        --update-secrets="DATABASE_URL=knowledge-assistant-secrets:DATABASE_URL:latest" \
        --update-secrets="JWT_SECRET=knowledge-assistant-secrets:JWT_SECRET:latest" \
        --update-secrets="GEMINI_API_KEY=knowledge-assistant-secrets:GEMINI_API_KEY:latest" \
        --set-env-vars="QDRANT_HOST=${QDRANT_URL},QDRANT_PORT=443,PYTHONUNBUFFERED=1,PYTHONDONTWRITEBYTECODE=1,USER_REGISTRATION_ENABLED=true,EMAIL_VERIFICATION_REQUIRED=false,JWT_LIFETIME_SECONDS=3600" \
        --allow-unauthenticated
    
    # Get backend service URL
    BACKEND_URL=$(gcloud run services describe knowledge-assistant-backend --region="$REGION" --format="value(status.url)")
    print_success "Backend deployed at: $BACKEND_URL"
    
    # Deploy frontend service
    print_status "Deploying frontend service..."
    gcloud run deploy knowledge-assistant-frontend \
        --image="gcr.io/${PROJECT_ID}/knowledge-assistant-frontend:latest" \
        --platform=managed \
        --region="$REGION" \
        --memory=512Mi \
        --cpu=1 \
        --max-instances=10 \
        --min-instances=0 \
        --port=8080 \
        --set-env-vars="VITE_API_BASE_URL=${BACKEND_URL},VITE_API_TIMEOUT=30000,VITE_ENABLE_REGISTRATION=true" \
        --allow-unauthenticated
    
    # Get frontend service URL
    FRONTEND_URL=$(gcloud run services describe knowledge-assistant-frontend --region="$REGION" --format="value(status.url)")
    print_success "Frontend deployed at: $FRONTEND_URL"
    
    # Update backend CORS settings
    print_status "Updating backend CORS settings..."
    gcloud run services update knowledge-assistant-backend \
        --region="$REGION" \
        --update-env-vars="CORS_ORIGINS=${FRONTEND_URL}"
    
    print_success "All services deployed successfully!"
    
    # Display deployment summary
    echo ""
    echo "=== DEPLOYMENT SUMMARY ==="
    echo "Frontend URL: $FRONTEND_URL"
    echo "Backend URL: $BACKEND_URL"
    echo "Qdrant URL: $QDRANT_URL"
    echo "=========================="
}

# Function to run health checks
run_health_checks() {
    print_status "Running health checks..."
    
    # Get service URLs
    FRONTEND_URL=$(gcloud run services describe knowledge-assistant-frontend --region="$REGION" --format="value(status.url)")
    BACKEND_URL=$(gcloud run services describe knowledge-assistant-backend --region="$REGION" --format="value(status.url)")
    QDRANT_URL=$(gcloud run services describe knowledge-assistant-qdrant --region="$REGION" --format="value(status.url)")
    
    # Check Qdrant health
    print_status "Checking Qdrant health..."
    if curl -f "${QDRANT_URL}/health" &>/dev/null; then
        print_success "Qdrant is healthy"
    else
        print_warning "Qdrant health check failed"
    fi
    
    # Check backend health
    print_status "Checking backend health..."
    if curl -f "${BACKEND_URL}/health" &>/dev/null; then
        print_success "Backend is healthy"
    else
        print_warning "Backend health check failed"
    fi
    
    # Check frontend
    print_status "Checking frontend..."
    if curl -f "$FRONTEND_URL" &>/dev/null; then
        print_success "Frontend is accessible"
    else
        print_warning "Frontend accessibility check failed"
    fi
    
    print_success "Health checks completed"
}

# Main deployment function
main() {
    print_status "Starting Cloud Run deployment for Knowledge Assistant..."
    
    check_prerequisites
    load_environment
    setup_gcloud
    create_secrets
    create_service_accounts
    create_cloud_sql
    build_and_push_images
    deploy_services
    run_health_checks
    
    print_success "Deployment completed successfully!"
    print_status "You can now access your application at the frontend URL shown above."
}

# Handle script arguments
case "${1:-}" in
    "secrets")
        load_environment
        create_secrets
        ;;
    "build")
        load_environment
        build_and_push_images
        ;;
    "deploy")
        load_environment
        deploy_services
        ;;
    "health")
        load_environment
        run_health_checks
        ;;
    "")
        main
        ;;
    *)
        echo "Usage: $0 [secrets|build|deploy|health]"
        echo "  secrets - Create secrets only"
        echo "  build   - Build and push images only"
        echo "  deploy  - Deploy services only"
        echo "  health  - Run health checks only"
        echo "  (no args) - Run full deployment"
        exit 1
        ;;
esac