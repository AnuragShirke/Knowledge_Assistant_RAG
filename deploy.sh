#!/bin/bash

# Master Deployment Script for Knowledge Assistant RAG
# This script provides an interactive interface to deploy to various platforms

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="1.0.0"

# Logging functions
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

info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

# Display banner
show_banner() {
    echo -e "${BOLD}${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                Knowledge Assistant RAG                       ║"
    echo "║                 Deployment Manager v${VERSION}                    ║"
    echo "║                                                              ║"
    echo "║  Deploy your RAG application to multiple cloud platforms    ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Show help information
show_help() {
    echo "Knowledge Assistant RAG Deployment Manager"
    echo ""
    echo "Usage: $0 [OPTIONS] [PLATFORM]"
    echo ""
    echo "Platforms:"
    echo "  railway     Deploy to Railway.app (free tier)"
    echo "  fly         Deploy to Fly.io (free tier)"
    echo "  cloudrun    Deploy to Google Cloud Run"
    echo "  vercel      Deploy to Vercel (hybrid deployment)"
    echo "  local       Deploy locally with Docker"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -v, --version       Show version information"
    echo "  --validate-only     Only validate environment and prerequisites"
    echo "  --dry-run          Show what would be deployed without executing"
    echo "  --force            Skip confirmation prompts"
    echo "  --backend-only     Deploy only backend services"
    echo "  --frontend-only    Deploy only frontend services"
    echo ""
    echo "Examples:"
    echo "  $0                  # Interactive platform selection"
    echo "  $0 railway          # Deploy to Railway"
    echo "  $0 --validate-only  # Check prerequisites only"
    echo "  $0 cloudrun --dry-run  # Show Cloud Run deployment plan"
    echo ""
}

# Show version information
show_version() {
    echo "Knowledge Assistant RAG Deployment Manager v${VERSION}"
    echo "Copyright (c) 2024"
}

# Check system prerequisites
check_system_prerequisites() {
    log "Checking system prerequisites..."
    
    local missing_tools=()
    
    # Check for required tools
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    fi
    
    if ! command -v curl &> /dev/null; then
        missing_tools+=("curl")
    fi
    
    if ! command -v git &> /dev/null; then
        missing_tools+=("git")
    fi
    
    # Check Docker daemon
    if command -v docker &> /dev/null; then
        if ! docker info &> /dev/null; then
            error "Docker daemon is not running. Please start Docker."
            return 1
        fi
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        error "Missing required tools: ${missing_tools[*]}"
        echo "Please install the missing tools and try again."
        return 1
    fi
    
    success "System prerequisites check passed"
    return 0
}

# Validate project structure
validate_project_structure() {
    log "Validating project structure..."
    
    local required_files=(
        "Dockerfile"
        "docker-compose.yml"
        "requirements.txt"
        "rag-quest-hub/package.json"
        "rag-quest-hub/Dockerfile"
    )
    
    local missing_files=()
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            missing_files+=("$file")
        fi
    done
    
    if [ ${#missing_files[@]} -ne 0 ]; then
        error "Missing required files: ${missing_files[*]}"
        return 1
    fi
    
    success "Project structure validation passed"
    return 0
}

# Check platform-specific prerequisites
check_platform_prerequisites() {
    local platform=$1
    
    case $platform in
        railway)
            if ! command -v railway &> /dev/null; then
                error "Railway CLI not found. Install with: npm install -g @railway/cli"
                return 1
            fi
            if ! railway whoami &> /dev/null; then
                error "Not authenticated with Railway. Run: railway login"
                return 1
            fi
            ;;
        fly)
            if ! command -v flyctl &> /dev/null; then
                error "Fly CLI not found. Install from: https://fly.io/docs/getting-started/installing-flyctl/"
                return 1
            fi
            if ! flyctl auth whoami &> /dev/null; then
                error "Not authenticated with Fly.io. Run: flyctl auth login"
                return 1
            fi
            ;;
        cloudrun)
            if ! command -v gcloud &> /dev/null; then
                error "Google Cloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install"
                return 1
            fi
            if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n1 &> /dev/null; then
                error "Not authenticated with Google Cloud. Run: gcloud auth login"
                return 1
            fi
            ;;
        vercel)
            if ! command -v vercel &> /dev/null; then
                error "Vercel CLI not found. Install with: npm install -g vercel"
                return 1
            fi
            if ! vercel whoami &> /dev/null; then
                error "Not authenticated with Vercel. Run: vercel login"
                return 1
            fi
            ;;
        local)
            # Local deployment only needs Docker
            ;;
        *)
            error "Unknown platform: $platform"
            return 1
            ;;
    esac
    
    success "Platform prerequisites for $platform are satisfied"
    return 0
}

# Validate environment configuration
validate_environment() {
    local platform=$1
    log "Validating environment configuration for $platform..."
    
    local env_file=""
    case $platform in
        railway)
            env_file=".env.railway"
            ;;
        fly)
            env_file=".env.fly"
            ;;
        cloudrun)
            env_file=".env.cloudrun"
            ;;
        vercel)
            env_file=".env.vercel"
            ;;
        local)
            env_file=".env.production"
            ;;
    esac
    
    if [ ! -f "$env_file" ]; then
        warning "Environment file $env_file not found"
        
        local template_file="${env_file}.template"
        if [ -f "$template_file" ]; then
            info "Creating $env_file from template..."
            cp "$template_file" "$env_file"
            warning "Please edit $env_file with your configuration before continuing"
            
            if [ "$FORCE_DEPLOY" != "true" ]; then
                read -p "Press Enter after editing $env_file, or Ctrl+C to cancel..."
            fi
        else
            error "Template file $template_file not found"
            return 1
        fi
    fi
    
    # Source and validate environment variables
    source "$env_file"
    
    # Check JWT_SECRET
    if [ -z "$JWT_SECRET" ] || [[ "$JWT_SECRET" == *"change"* ]] || [[ "$JWT_SECRET" == *"your-"* ]]; then
        error "JWT_SECRET must be set to a secure value (32+ characters)"
        return 1
    fi
    
    if [ ${#JWT_SECRET} -lt 32 ]; then
        error "JWT_SECRET must be at least 32 characters long"
        return 1
    fi
    
    success "Environment configuration validated"
    return 0
}

# Show deployment plan
show_deployment_plan() {
    local platform=$1
    local services=$2
    
    echo ""
    echo -e "${BOLD}Deployment Plan${NC}"
    echo "================"
    echo "Platform: $platform"
    echo "Services: $services"
    echo ""
    
    case $platform in
        railway)
            echo "Railway.app Deployment:"
            echo "• Backend: FastAPI application"
            echo "• Frontend: React/Vite application"
            echo "• Database: Railway PostgreSQL (optional)"
            echo "• Vector DB: Qdrant container"
            echo "• LLM: Google Gemini API"
            echo "• Resource limits: 512MB RAM, 1GB storage"
            ;;
        fly)
            echo "Fly.io Deployment:"
            echo "• Backend: FastAPI application"
            echo "• Frontend: React/Vite application"
            echo "• Database: SQLite with persistent volumes"
            echo "• Vector DB: Qdrant container"
            echo "• LLM: Google Gemini API"
            echo "• Resource limits: 256MB RAM, 1GB storage"
            ;;
        cloudrun)
            echo "Google Cloud Run Deployment:"
            echo "• Backend: FastAPI container"
            echo "• Frontend: React/Vite container"
            echo "• Database: Cloud SQL PostgreSQL"
            echo "• Vector DB: Qdrant container"
            echo "• LLM: Google Gemini API"
            echo "• Resource limits: 1GB memory, 2 vCPU"
            ;;
        vercel)
            echo "Vercel Hybrid Deployment:"
            echo "• Frontend: Static site on Vercel"
            echo "• Backend: Serverless functions on Vercel"
            echo "• Database: External managed service"
            echo "• Vector DB: Qdrant Cloud"
            echo "• LLM: Google Gemini API"
            ;;
        local)
            echo "Local Docker Deployment:"
            echo "• Backend: FastAPI container"
            echo "• Frontend: React/Vite container"
            echo "• Database: SQLite in volume"
            echo "• Vector DB: Qdrant container"
            echo "• LLM: Google Gemini API"
            ;;
    esac
    echo ""
}

# Interactive platform selection
select_platform() {
    echo ""
    echo -e "${BOLD}Select Deployment Platform:${NC}"
    echo ""
    echo "1) Railway.app (Free tier: 512MB RAM, 1GB storage)"
    echo "2) Fly.io (Free tier: 256MB RAM, 1GB storage)"
    echo "3) Google Cloud Run (Free tier: 1GB memory, 2 vCPU)"
    echo "4) Vercel (Hybrid: Static frontend + serverless backend)"
    echo "5) Local Docker (Development/testing)"
    echo ""
    
    while true; do
        read -p "Enter your choice (1-5): " choice
        case $choice in
            1) echo "railway"; return ;;
            2) echo "fly"; return ;;
            3) echo "cloudrun"; return ;;
            4) echo "vercel"; return ;;
            5) echo "local"; return ;;
            *) echo "Invalid choice. Please enter 1-5." ;;
        esac
    done
}

# Execute deployment
execute_deployment() {
    local platform=$1
    local services=$2
    
    log "Starting deployment to $platform..."
    
    case $platform in
        railway)
            if [ "$services" = "backend-only" ]; then
                bash "$SCRIPT_DIR/deploy-railway.sh" --backend-only
            elif [ "$services" = "frontend-only" ]; then
                bash "$SCRIPT_DIR/deploy-railway.sh" --frontend-only
            else
                bash "$SCRIPT_DIR/deploy-railway.sh"
            fi
            ;;
        fly)
            # Fly.io deployment would be implemented here
            error "Fly.io deployment not yet implemented"
            return 1
            ;;
        cloudrun)
            bash "$SCRIPT_DIR/deploy-cloudrun.sh"
            ;;
        vercel)
            # Vercel deployment would be implemented here
            error "Vercel deployment not yet implemented"
            return 1
            ;;
        local)
            bash "$SCRIPT_DIR/deploy-production.sh"
            ;;
        *)
            error "Unknown platform: $platform"
            return 1
            ;;
    esac
}

# Rollback deployment
rollback_deployment() {
    local platform=$1
    
    warning "Rolling back deployment on $platform..."
    
    case $platform in
        railway)
            railway service list | grep -E "(backend|frontend)" | while read -r service; do
                service_name=$(echo "$service" | awk '{print $1}')
                warning "Rolling back $service_name..."
                railway rollback --service "$service_name" || true
            done
            ;;
        cloudrun)
            warning "Cloud Run rollback requires manual intervention via Google Cloud Console"
            ;;
        local)
            docker-compose -f docker-compose.prod.yml down || true
            ;;
        *)
            warning "Rollback not implemented for $platform"
            ;;
    esac
}

# Main deployment function
main() {
    local platform=""
    local services="all"
    local validate_only=false
    local dry_run=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -v|--version)
                show_version
                exit 0
                ;;
            --validate-only)
                validate_only=true
                shift
                ;;
            --dry-run)
                dry_run=true
                shift
                ;;
            --force)
                FORCE_DEPLOY=true
                shift
                ;;
            --backend-only)
                services="backend-only"
                shift
                ;;
            --frontend-only)
                services="frontend-only"
                shift
                ;;
            railway|fly|cloudrun|vercel|local)
                platform=$1
                shift
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Show banner
    show_banner
    
    # Check system prerequisites
    if ! check_system_prerequisites; then
        exit 1
    fi
    
    # Validate project structure
    if ! validate_project_structure; then
        exit 1
    fi
    
    # Select platform if not provided
    if [ -z "$platform" ]; then
        platform=$(select_platform)
    fi
    
    # Check platform prerequisites
    if ! check_platform_prerequisites "$platform"; then
        exit 1
    fi
    
    # Validate environment
    if ! validate_environment "$platform"; then
        exit 1
    fi
    
    # Show deployment plan
    show_deployment_plan "$platform" "$services"
    
    # Exit if validate-only
    if [ "$validate_only" = true ]; then
        success "Validation completed successfully"
        exit 0
    fi
    
    # Exit if dry-run
    if [ "$dry_run" = true ]; then
        info "Dry run completed - no deployment executed"
        exit 0
    fi
    
    # Confirm deployment
    if [ "$FORCE_DEPLOY" != "true" ]; then
        echo -n "Proceed with deployment? (y/N): "
        read -r confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            info "Deployment cancelled"
            exit 0
        fi
    fi
    
    # Execute deployment with error handling
    if ! execute_deployment "$platform" "$services"; then
        error "Deployment failed"
        
        if [ "$FORCE_DEPLOY" != "true" ]; then
            echo -n "Attempt rollback? (y/N): "
            read -r rollback_confirm
            if [[ "$rollback_confirm" =~ ^[Yy]$ ]]; then
                rollback_deployment "$platform"
            fi
        fi
        
        exit 1
    fi
    
    success "Deployment completed successfully!"
}

# Handle script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi