#!/bin/bash

# Deployment Utilities and Helper Functions
# This script provides common utilities for deployment operations

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

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

# Generate secure JWT secret
generate_jwt_secret() {
    local length=${1:-64}
    openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
}

# Validate JWT secret
validate_jwt_secret() {
    local secret=$1
    
    if [ -z "$secret" ]; then
        error "JWT secret is empty"
        return 1
    fi
    
    if [ ${#secret} -lt 32 ]; then
        error "JWT secret must be at least 32 characters long"
        return 1
    fi
    
    if [[ "$secret" == *"change"* ]] || [[ "$secret" == *"your-"* ]] || [[ "$secret" == *"example"* ]]; then
        error "JWT secret appears to be a placeholder value"
        return 1
    fi
    
    success "JWT secret validation passed"
    return 0
}

# Wait for service to be ready
wait_for_service() {
    local url=$1
    local timeout=${2:-300}  # 5 minutes default
    local interval=${3:-10}  # 10 seconds default
    local service_name=${4:-"service"}
    
    log "Waiting for $service_name to be ready at $url..."
    
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if curl -f -s "$url" > /dev/null 2>&1; then
            success "$service_name is ready"
            return 0
        fi
        
        log "Waiting for $service_name... (${elapsed}s/${timeout}s)"
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    error "$service_name failed to become ready within ${timeout}s"
    return 1
}

# Check service health
check_service_health() {
    local url=$1
    local service_name=${2:-"service"}
    local expected_status=${3:-200}
    
    log "Checking health of $service_name..."
    
    local response
    local status_code
    
    response=$(curl -s -w "%{http_code}" "$url" 2>/dev/null)
    status_code="${response: -3}"
    
    if [ "$status_code" = "$expected_status" ]; then
        success "$service_name health check passed (HTTP $status_code)"
        return 0
    else
        error "$service_name health check failed (HTTP $status_code)"
        return 1
    fi
}

# Run database migrations
run_database_migrations() {
    local database_url=$1
    local migration_dir=${2:-"alembic"}
    
    log "Running database migrations..."
    
    if [ ! -d "$migration_dir" ]; then
        warning "Migration directory $migration_dir not found, skipping migrations"
        return 0
    fi
    
    # Set database URL for alembic
    export DATABASE_URL="$database_url"
    
    # Run migrations
    if command -v alembic &> /dev/null; then
        alembic upgrade head
        success "Database migrations completed"
    else
        warning "Alembic not found, skipping migrations"
    fi
}

# Initialize database
initialize_database() {
    local database_url=$1
    local init_script=${2:-"scripts/init-db.sh"}
    
    log "Initializing database..."
    
    if [ -f "$init_script" ]; then
        DATABASE_URL="$database_url" bash "$init_script"
        success "Database initialization completed"
    else
        warning "Database initialization script not found at $init_script"
    fi
}

# Backup SQLite database
backup_sqlite_database() {
    local db_path=$1
    local backup_dir=${2:-"backups"}
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    
    if [ ! -f "$db_path" ]; then
        warning "Database file $db_path not found, skipping backup"
        return 0
    fi
    
    mkdir -p "$backup_dir"
    local backup_file="$backup_dir/database_backup_$timestamp.db"
    
    log "Creating database backup..."
    cp "$db_path" "$backup_file"
    
    # Compress backup
    gzip "$backup_file"
    success "Database backup created: ${backup_file}.gz"
}

# Restore SQLite database
restore_sqlite_database() {
    local backup_file=$1
    local db_path=$2
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file $backup_file not found"
        return 1
    fi
    
    log "Restoring database from backup..."
    
    # Handle compressed backups
    if [[ "$backup_file" == *.gz ]]; then
        gunzip -c "$backup_file" > "$db_path"
    else
        cp "$backup_file" "$db_path"
    fi
    
    success "Database restored from $backup_file"
}

# Check disk space
check_disk_space() {
    local path=${1:-"."}
    local min_space_gb=${2:-1}
    
    log "Checking disk space..."
    
    local available_space
    available_space=$(df "$path" | awk 'NR==2 {print $4}')
    local available_gb=$((available_space / 1024 / 1024))
    
    if [ $available_gb -lt $min_space_gb ]; then
        error "Insufficient disk space: ${available_gb}GB available, ${min_space_gb}GB required"
        return 1
    fi
    
    success "Disk space check passed: ${available_gb}GB available"
    return 0
}

# Check memory usage
check_memory_usage() {
    local max_usage_percent=${1:-80}
    
    log "Checking memory usage..."
    
    local memory_usage
    memory_usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    if [ "$memory_usage" -gt "$max_usage_percent" ]; then
        warning "High memory usage: ${memory_usage}%"
        return 1
    fi
    
    success "Memory usage check passed: ${memory_usage}%"
    return 0
}

# Clean up old Docker images
cleanup_docker_images() {
    local keep_images=${1:-3}
    
    log "Cleaning up old Docker images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old images (keep latest N)
    docker images --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}" | \
        grep -E "(knowledge-assistant|rag)" | \
        sort -k2 -r | \
        tail -n +$((keep_images + 1)) | \
        awk '{print $1}' | \
        xargs -r docker rmi -f
    
    success "Docker cleanup completed"
}

# Validate environment file
validate_env_file() {
    local env_file=$1
    local required_vars=("${@:2}")
    
    if [ ! -f "$env_file" ]; then
        error "Environment file $env_file not found"
        return 1
    fi
    
    log "Validating environment file: $env_file"
    
    # Source the file
    source "$env_file"
    
    # Check required variables
    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        error "Missing required environment variables: ${missing_vars[*]}"
        return 1
    fi
    
    success "Environment file validation passed"
    return 0
}

# Create environment file from template
create_env_from_template() {
    local template_file=$1
    local env_file=$2
    local auto_generate=${3:-false}
    
    if [ ! -f "$template_file" ]; then
        error "Template file $template_file not found"
        return 1
    fi
    
    if [ -f "$env_file" ]; then
        warning "Environment file $env_file already exists"
        return 0
    fi
    
    log "Creating environment file from template..."
    cp "$template_file" "$env_file"
    
    if [ "$auto_generate" = "true" ]; then
        # Auto-generate JWT secret
        local jwt_secret
        jwt_secret=$(generate_jwt_secret)
        
        # Replace placeholder values
        sed -i "s/your-super-secret-jwt-key-change-in-production-minimum-32-chars/$jwt_secret/g" "$env_file"
        sed -i "s/your-super-secure-jwt-secret-key-change-this-in-production/$jwt_secret/g" "$env_file"
        
        success "Environment file created with auto-generated values"
    else
        success "Environment file created from template"
        warning "Please edit $env_file with your configuration"
    fi
}

# Monitor deployment progress
monitor_deployment() {
    local platform=$1
    local services=("${@:2}")
    
    log "Monitoring deployment progress on $platform..."
    
    case $platform in
        railway)
            for service in "${services[@]}"; do
                log "Monitoring Railway service: $service"
                railway logs --service "$service" --tail 50 &
            done
            ;;
        cloudrun)
            for service in "${services[@]}"; do
                log "Monitoring Cloud Run service: $service"
                gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=$service" &
            done
            ;;
        local)
            log "Monitoring local Docker containers"
            docker-compose -f docker-compose.prod.yml logs -f &
            ;;
        *)
            warning "Monitoring not implemented for platform: $platform"
            ;;
    esac
    
    # Wait for user input to stop monitoring
    read -p "Press Enter to stop monitoring..."
    
    # Kill background jobs
    jobs -p | xargs -r kill
}

# Export functions for use in other scripts
export -f log error success warning info
export -f generate_jwt_secret validate_jwt_secret
export -f wait_for_service check_service_health
export -f run_database_migrations initialize_database
export -f backup_sqlite_database restore_sqlite_database
export -f check_disk_space check_memory_usage
export -f cleanup_docker_images validate_env_file
export -f create_env_from_template monitor_deployment