#!/bin/bash

# Comprehensive Health Check Script
# This script performs health checks for all services in the Knowledge Assistant RAG application

set -e

# Source deployment utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deployment-utils.sh"

# Configuration
TIMEOUT=30
RETRY_INTERVAL=5
MAX_RETRIES=6

# Health check results
declare -A HEALTH_RESULTS

# Perform health check for a service
check_service() {
    local service_name=$1
    local health_url=$2
    local expected_status=${3:-200}
    
    log "Checking $service_name health..."
    
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        local response
        local status_code
        
        response=$(curl -s -w "%{http_code}" --max-time $TIMEOUT "$health_url" 2>/dev/null || echo "000")
        status_code="${response: -3}"
        
        if [ "$status_code" = "$expected_status" ]; then
            success "$service_name is healthy (HTTP $status_code)"
            HEALTH_RESULTS[$service_name]="HEALTHY"
            return 0
        else
            warning "$service_name health check failed (HTTP $status_code), retry $((retries + 1))/$MAX_RETRIES"
            retries=$((retries + 1))
            
            if [ $retries -lt $MAX_RETRIES ]; then
                sleep $RETRY_INTERVAL
            fi
        fi
    done
    
    error "$service_name is unhealthy after $MAX_RETRIES attempts"
    HEALTH_RESULTS[$service_name]="UNHEALTHY"
    return 1
}

# Check database connectivity
check_database() {
    local database_url=$1
    local service_name="Database"
    
    log "Checking database connectivity..."
    
    if [[ "$database_url" == sqlite* ]]; then
        # SQLite database check
        local db_file=$(echo "$database_url" | sed 's/sqlite:\/\/\///')
        if [ -f "$db_file" ]; then
            success "SQLite database file exists: $db_file"
            HEALTH_RESULTS[$service_name]="HEALTHY"
        else
            error "SQLite database file not found: $db_file"
            HEALTH_RESULTS[$service_name]="UNHEALTHY"
        fi
    elif [[ "$database_url" == postgresql* ]]; then
        # PostgreSQL database check
        if command -v psql &> /dev/null; then
            if psql "$database_url" -c "SELECT 1;" &> /dev/null; then
                success "PostgreSQL database is accessible"
                HEALTH_RESULTS[$service_name]="HEALTHY"
            else
                error "PostgreSQL database is not accessible"
                HEALTH_RESULTS[$service_name]="UNHEALTHY"
            fi
        else
            warning "psql not available, skipping PostgreSQL connectivity check"
            HEALTH_RESULTS[$service_name]="UNKNOWN"
        fi
    else
        warning "Unknown database type, skipping connectivity check"
        HEALTH_RESULTS[$service_name]="UNKNOWN"
    fi
}

# Check Qdrant vector database
check_qdrant() {
    local qdrant_host=${1:-"localhost"}
    local qdrant_port=${2:-"6333"}
    local qdrant_url="http://$qdrant_host:$qdrant_port"
    
    # Handle HTTPS URLs
    if [[ "$qdrant_host" == https://* ]]; then
        qdrant_url="$qdrant_host"
    fi
    
    check_service "Qdrant" "$qdrant_url/health"
    
    # Additional Qdrant-specific checks
    if [ "${HEALTH_RESULTS[Qdrant]}" = "HEALTHY" ]; then
        log "Checking Qdrant collections..."
        local collections_response
        collections_response=$(curl -s "$qdrant_url/collections" 2>/dev/null || echo "{}")
        
        if echo "$collections_response" | grep -q "result"; then
            success "Qdrant collections endpoint is accessible"
        else
            warning "Qdrant collections endpoint may have issues"
        fi
    fi
}

# Check external API services
check_external_apis() {
    log "Checking external API services..."
    
    # Check Google Gemini API
    if [ -n "$GEMINI_API_KEY" ]; then
        log "Checking Google Gemini API..."
        local gemini_response
        gemini_response=$(curl -s -w "%{http_code}" \
            -H "Content-Type: application/json" \
            -H "x-goog-api-key: $GEMINI_API_KEY" \
            "https://generativelanguage.googleapis.com/v1beta/models" 2>/dev/null || echo "000")
        
        local status_code="${gemini_response: -3}"
        if [ "$status_code" = "200" ]; then
            success "Google Gemini API is accessible"
            HEALTH_RESULTS["Gemini API"]="HEALTHY"
        else
            error "Google Gemini API is not accessible (HTTP $status_code)"
            HEALTH_RESULTS["Gemini API"]="UNHEALTHY"
        fi
    else
        warning "GEMINI_API_KEY not set, skipping Gemini API check"
        HEALTH_RESULTS["Gemini API"]="UNKNOWN"
    fi
    
    # Check OpenAI API (if configured)
    if [ -n "$OPENAI_API_KEY" ]; then
        log "Checking OpenAI API..."
        local openai_response
        openai_response=$(curl -s -w "%{http_code}" \
            -H "Authorization: Bearer $OPENAI_API_KEY" \
            "https://api.openai.com/v1/models" 2>/dev/null || echo "000")
        
        local status_code="${openai_response: -3}"
        if [ "$status_code" = "200" ]; then
            success "OpenAI API is accessible"
            HEALTH_RESULTS["OpenAI API"]="HEALTHY"
        else
            error "OpenAI API is not accessible (HTTP $status_code)"
            HEALTH_RESULTS["OpenAI API"]="UNHEALTHY"
        fi
    fi
}

# Check Docker containers (for local deployment)
check_docker_containers() {
    log "Checking Docker containers..."
    
    local containers=("knowledge-assistant-backend" "knowledge-assistant-frontend" "qdrant")
    
    for container in "${containers[@]}"; do
        if docker ps --format "table {{.Names}}" | grep -q "$container"; then
            local status
            status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
            
            case $status in
                "healthy")
                    success "Container $container is healthy"
                    HEALTH_RESULTS["Docker-$container"]="HEALTHY"
                    ;;
                "unhealthy")
                    error "Container $container is unhealthy"
                    HEALTH_RESULTS["Docker-$container"]="UNHEALTHY"
                    ;;
                "starting")
                    warning "Container $container is starting"
                    HEALTH_RESULTS["Docker-$container"]="STARTING"
                    ;;
                *)
                    warning "Container $container health status unknown"
                    HEALTH_RESULTS["Docker-$container"]="UNKNOWN"
                    ;;
            esac
        else
            warning "Container $container is not running"
            HEALTH_RESULTS["Docker-$container"]="NOT_RUNNING"
        fi
    done
}

# Check system resources
check_system_resources() {
    log "Checking system resources..."
    
    # Check disk space
    if check_disk_space "." 1; then
        HEALTH_RESULTS["Disk Space"]="HEALTHY"
    else
        HEALTH_RESULTS["Disk Space"]="UNHEALTHY"
    fi
    
    # Check memory usage
    if check_memory_usage 90; then
        HEALTH_RESULTS["Memory Usage"]="HEALTHY"
    else
        HEALTH_RESULTS["Memory Usage"]="WARNING"
    fi
    
    # Check CPU load
    local cpu_load
    cpu_load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    local cpu_cores
    cpu_cores=$(nproc)
    local cpu_usage
    cpu_usage=$(echo "scale=2; $cpu_load / $cpu_cores * 100" | bc 2>/dev/null || echo "0")
    
    if (( $(echo "$cpu_usage < 80" | bc -l) )); then
        success "CPU load is normal: ${cpu_usage}%"
        HEALTH_RESULTS["CPU Load"]="HEALTHY"
    else
        warning "High CPU load: ${cpu_usage}%"
        HEALTH_RESULTS["CPU Load"]="WARNING"
    fi
}

# Generate health report
generate_health_report() {
    echo ""
    echo "=================================="
    echo "    HEALTH CHECK REPORT"
    echo "=================================="
    echo "Timestamp: $(date)"
    echo ""
    
    local healthy_count=0
    local unhealthy_count=0
    local warning_count=0
    local unknown_count=0
    
    for service in "${!HEALTH_RESULTS[@]}"; do
        local status="${HEALTH_RESULTS[$service]}"
        local status_icon=""
        
        case $status in
            "HEALTHY")
                status_icon="✅"
                healthy_count=$((healthy_count + 1))
                ;;
            "UNHEALTHY")
                status_icon="❌"
                unhealthy_count=$((unhealthy_count + 1))
                ;;
            "WARNING"|"STARTING")
                status_icon="⚠️ "
                warning_count=$((warning_count + 1))
                ;;
            "UNKNOWN"|"NOT_RUNNING")
                status_icon="❓"
                unknown_count=$((unknown_count + 1))
                ;;
        esac
        
        printf "%-20s %s %s\n" "$service" "$status_icon" "$status"
    done
    
    echo ""
    echo "Summary:"
    echo "  Healthy: $healthy_count"
    echo "  Unhealthy: $unhealthy_count"
    echo "  Warnings: $warning_count"
    echo "  Unknown: $unknown_count"
    echo ""
    
    # Overall health status
    if [ $unhealthy_count -eq 0 ] && [ $warning_count -eq 0 ]; then
        success "Overall system health: EXCELLENT"
        return 0
    elif [ $unhealthy_count -eq 0 ]; then
        warning "Overall system health: GOOD (with warnings)"
        return 0
    else
        error "Overall system health: POOR (issues detected)"
        return 1
    fi
}

# Main health check function
main() {
    local platform=""
    local env_file=""
    local check_docker=false
    local check_external=true
    local output_file=""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --platform)
                platform="$2"
                shift 2
                ;;
            --env-file)
                env_file="$2"
                shift 2
                ;;
            --docker)
                check_docker=true
                shift
                ;;
            --no-external)
                check_external=false
                shift
                ;;
            --output)
                output_file="$2"
                shift 2
                ;;
            --help)
                echo "Health Check Script for Knowledge Assistant RAG"
                echo ""
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --platform PLATFORM    Platform type (railway, cloudrun, local)"
                echo "  --env-file FILE        Environment file to load"
                echo "  --docker               Check Docker containers"
                echo "  --no-external          Skip external API checks"
                echo "  --output FILE          Save report to file"
                echo "  --help                 Show this help"
                echo ""
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    log "Starting comprehensive health check..."
    
    # Load environment variables
    if [ -n "$env_file" ] && [ -f "$env_file" ]; then
        source "$env_file"
    elif [ -f ".env" ]; then
        source ".env"
    fi
    
    # Determine service URLs based on platform
    case $platform in
        railway)
            # Railway URLs would be determined dynamically
            if command -v railway &> /dev/null; then
                BACKEND_URL=$(railway service list | grep backend | awk '{print $3}' | head -1)
                FRONTEND_URL=$(railway service list | grep frontend | awk '{print $3}' | head -1)
            fi
            ;;
        cloudrun)
            # Cloud Run URLs would be determined dynamically
            if command -v gcloud &> /dev/null; then
                BACKEND_URL=$(gcloud run services describe knowledge-assistant-backend --region=us-central1 --format="value(status.url)" 2>/dev/null || echo "")
                FRONTEND_URL=$(gcloud run services describe knowledge-assistant-frontend --region=us-central1 --format="value(status.url)" 2>/dev/null || echo "")
            fi
            ;;
        local|*)
            BACKEND_URL=${BACKEND_URL:-"http://localhost:8000"}
            FRONTEND_URL=${FRONTEND_URL:-"http://localhost:3000"}
            QDRANT_HOST=${QDRANT_HOST:-"localhost"}
            QDRANT_PORT=${QDRANT_PORT:-"6333"}
            check_docker=true
            ;;
    esac
    
    # Perform health checks
    if [ -n "$BACKEND_URL" ]; then
        check_service "Backend" "$BACKEND_URL/health"
    fi
    
    if [ -n "$FRONTEND_URL" ]; then
        check_service "Frontend" "$FRONTEND_URL" 200
    fi
    
    if [ -n "$DATABASE_URL" ]; then
        check_database "$DATABASE_URL"
    fi
    
    if [ -n "$QDRANT_HOST" ]; then
        check_qdrant "$QDRANT_HOST" "$QDRANT_PORT"
    fi
    
    if [ "$check_external" = true ]; then
        check_external_apis
    fi
    
    if [ "$check_docker" = true ]; then
        check_docker_containers
    fi
    
    check_system_resources
    
    # Generate and display report
    local report_output
    report_output=$(generate_health_report)
    echo "$report_output"
    
    # Save to file if requested
    if [ -n "$output_file" ]; then
        echo "$report_output" > "$output_file"
        success "Health report saved to $output_file"
    fi
    
    # Return appropriate exit code
    if echo "$report_output" | grep -q "POOR"; then
        exit 1
    else
        exit 0
    fi
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi