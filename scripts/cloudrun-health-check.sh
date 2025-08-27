#!/bin/bash

# Cloud Run Health Check Script
# This script performs comprehensive health checks on all deployed Cloud Run services

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

# Configuration
REGION="us-central1"
TIMEOUT=30

# Function to check if a URL is accessible
check_url() {
    local url="$1"
    local service_name="$2"
    local expected_status="${3:-200}"
    
    print_status "Checking $service_name at $url"
    
    local response
    local status_code
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" --max-time $TIMEOUT "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    status_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    if [[ "$status_code" == "$expected_status" ]]; then
        print_success "$service_name is healthy (HTTP $status_code)"
        return 0
    else
        print_error "$service_name health check failed (HTTP $status_code)"
        return 1
    fi
}

# Function to check service deployment status
check_service_status() {
    local service_name="$1"
    
    print_status "Checking deployment status for $service_name"
    
    local status
    status=$(gcloud run services describe "$service_name" --region="$REGION" --format="value(status.conditions[0].status)" 2>/dev/null || echo "Unknown")
    
    if [[ "$status" == "True" ]]; then
        print_success "$service_name is deployed and ready"
        return 0
    else
        print_error "$service_name deployment status: $status"
        return 1
    fi
}

# Function to get service URL
get_service_url() {
    local service_name="$1"
    gcloud run services describe "$service_name" --region="$REGION" --format="value(status.url)" 2>/dev/null || echo ""
}

# Function to check service logs for errors
check_service_logs() {
    local service_name="$1"
    local lines="${2:-50}"
    
    print_status "Checking recent logs for $service_name (last $lines lines)"
    
    local error_count
    error_count=$(gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$service_name\"" \
        --limit="$lines" --format="value(severity)" 2>/dev/null | grep -c "ERROR" || echo "0")
    
    if [[ "$error_count" -eq 0 ]]; then
        print_success "No errors found in recent logs for $service_name"
    else
        print_warning "Found $error_count errors in recent logs for $service_name"
        
        # Show recent errors
        print_status "Recent errors for $service_name:"
        gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"$service_name\" AND severity=\"ERROR\"" \
            --limit=5 --format="value(timestamp,textPayload)" 2>/dev/null || echo "Could not retrieve error logs"
    fi
}

# Function to check resource usage
check_resource_usage() {
    local service_name="$1"
    
    print_status "Checking resource usage for $service_name"
    
    # Get current revision
    local revision
    revision=$(gcloud run services describe "$service_name" --region="$REGION" --format="value(status.latestReadyRevisionName)" 2>/dev/null || echo "")
    
    if [[ -n "$revision" ]]; then
        # Get memory and CPU limits
        local memory_limit
        local cpu_limit
        memory_limit=$(gcloud run revisions describe "$revision" --region="$REGION" --format="value(spec.template.spec.containers[0].resources.limits.memory)" 2>/dev/null || echo "Unknown")
        cpu_limit=$(gcloud run revisions describe "$revision" --region="$REGION" --format="value(spec.template.spec.containers[0].resources.limits.cpu)" 2>/dev/null || echo "Unknown")
        
        print_success "$service_name resource limits: Memory=$memory_limit, CPU=$cpu_limit"
    else
        print_warning "Could not retrieve resource information for $service_name"
    fi
}

# Function to test API endpoints
test_api_endpoints() {
    local backend_url="$1"
    
    print_status "Testing API endpoints"
    
    # Test health endpoint
    if check_url "$backend_url/health" "Backend Health Endpoint"; then
        print_success "Health endpoint is working"
    fi
    
    # Test docs endpoint
    if check_url "$backend_url/docs" "API Documentation"; then
        print_success "API documentation is accessible"
    fi
    
    # Test CORS preflight
    print_status "Testing CORS configuration"
    local cors_response
    cors_response=$(curl -s -X OPTIONS -H "Origin: https://example.com" -H "Access-Control-Request-Method: GET" "$backend_url/health" -w "HTTPSTATUS:%{http_code}" --max-time $TIMEOUT 2>/dev/null || echo "HTTPSTATUS:000")
    local cors_status
    cors_status=$(echo "$cors_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    
    if [[ "$cors_status" == "200" ]]; then
        print_success "CORS is properly configured"
    else
        print_warning "CORS configuration may need attention (HTTP $cors_status)"
    fi
}

# Function to test service connectivity
test_service_connectivity() {
    local frontend_url="$1"
    local backend_url="$2"
    local qdrant_url="$3"
    
    print_status "Testing service connectivity"
    
    # Test if frontend can reach backend
    print_status "Testing frontend to backend connectivity"
    local frontend_config
    frontend_config=$(curl -s "$frontend_url" --max-time $TIMEOUT 2>/dev/null | grep -o "VITE_API_BASE_URL.*" || echo "")
    
    if [[ "$frontend_config" == *"$backend_url"* ]]; then
        print_success "Frontend is configured to use correct backend URL"
    else
        print_warning "Frontend may not be configured with correct backend URL"
    fi
    
    # Test backend to Qdrant connectivity
    print_status "Testing backend to Qdrant connectivity"
    # This would require a specific endpoint that tests Qdrant connectivity
    # For now, we'll just check if both services are healthy
    if check_url "$backend_url/health" "Backend" && check_url "$qdrant_url/health" "Qdrant"; then
        print_success "Backend and Qdrant services are both healthy"
    fi
}

# Function to run comprehensive health check
run_comprehensive_check() {
    print_status "Starting comprehensive health check for Knowledge Assistant on Cloud Run"
    echo ""
    
    local services=("knowledge-assistant-frontend" "knowledge-assistant-backend" "knowledge-assistant-qdrant")
    local all_healthy=true
    
    # Check deployment status for all services
    print_status "=== DEPLOYMENT STATUS CHECK ==="
    for service in "${services[@]}"; do
        if ! check_service_status "$service"; then
            all_healthy=false
        fi
    done
    echo ""
    
    # Get service URLs
    local frontend_url backend_url qdrant_url
    frontend_url=$(get_service_url "knowledge-assistant-frontend")
    backend_url=$(get_service_url "knowledge-assistant-backend")
    qdrant_url=$(get_service_url "knowledge-assistant-qdrant")
    
    if [[ -z "$frontend_url" || -z "$backend_url" || -z "$qdrant_url" ]]; then
        print_error "Could not retrieve all service URLs"
        all_healthy=false
    else
        print_success "Retrieved all service URLs:"
        echo "  Frontend: $frontend_url"
        echo "  Backend: $backend_url"
        echo "  Qdrant: $qdrant_url"
    fi
    echo ""
    
    # Check URL accessibility
    print_status "=== URL ACCESSIBILITY CHECK ==="
    if [[ -n "$frontend_url" ]] && ! check_url "$frontend_url" "Frontend"; then
        all_healthy=false
    fi
    if [[ -n "$backend_url" ]] && ! check_url "$backend_url/health" "Backend Health"; then
        all_healthy=false
    fi
    if [[ -n "$qdrant_url" ]] && ! check_url "$qdrant_url/health" "Qdrant Health"; then
        all_healthy=false
    fi
    echo ""
    
    # Test API endpoints
    if [[ -n "$backend_url" ]]; then
        print_status "=== API ENDPOINTS CHECK ==="
        test_api_endpoints "$backend_url"
        echo ""
    fi
    
    # Test service connectivity
    if [[ -n "$frontend_url" && -n "$backend_url" && -n "$qdrant_url" ]]; then
        print_status "=== SERVICE CONNECTIVITY CHECK ==="
        test_service_connectivity "$frontend_url" "$backend_url" "$qdrant_url"
        echo ""
    fi
    
    # Check resource usage
    print_status "=== RESOURCE USAGE CHECK ==="
    for service in "${services[@]}"; do
        check_resource_usage "$service"
    done
    echo ""
    
    # Check logs for errors
    print_status "=== LOG ERROR CHECK ==="
    for service in "${services[@]}"; do
        check_service_logs "$service" 20
    done
    echo ""
    
    # Final summary
    print_status "=== HEALTH CHECK SUMMARY ==="
    if [[ "$all_healthy" == true ]]; then
        print_success "All services are healthy and operational!"
        print_success "Application is ready for use at: $frontend_url"
    else
        print_error "Some issues were detected. Please review the output above."
        return 1
    fi
}

# Function to run quick health check
run_quick_check() {
    print_status "Running quick health check..."
    
    local services=("knowledge-assistant-frontend" "knowledge-assistant-backend" "knowledge-assistant-qdrant")
    local all_healthy=true
    
    for service in "${services[@]}"; do
        local url
        url=$(get_service_url "$service")
        
        if [[ -n "$url" ]]; then
            local endpoint="$url"
            if [[ "$service" == *"backend"* || "$service" == *"qdrant"* ]]; then
                endpoint="$url/health"
            fi
            
            if ! check_url "$endpoint" "$service"; then
                all_healthy=false
            fi
        else
            print_error "Could not get URL for $service"
            all_healthy=false
        fi
    done
    
    if [[ "$all_healthy" == true ]]; then
        print_success "Quick health check passed - all services are responding"
    else
        print_error "Quick health check failed - some services have issues"
        return 1
    fi
}

# Main function
main() {
    local command="${1:-comprehensive}"
    
    case "$command" in
        "quick")
            run_quick_check
            ;;
        "comprehensive"|"")
            run_comprehensive_check
            ;;
        "logs")
            local service="${2:-knowledge-assistant-backend}"
            local lines="${3:-50}"
            check_service_logs "$service" "$lines"
            ;;
        "status")
            local service="${2:-}"
            if [[ -n "$service" ]]; then
                check_service_status "$service"
            else
                for svc in "knowledge-assistant-frontend" "knowledge-assistant-backend" "knowledge-assistant-qdrant"; do
                    check_service_status "$svc"
                done
            fi
            ;;
        *)
            echo "Usage: $0 [quick|comprehensive|logs|status] [service_name] [lines]"
            echo ""
            echo "Commands:"
            echo "  quick         - Quick health check of all services"
            echo "  comprehensive - Comprehensive health check (default)"
            echo "  logs          - Check logs for specific service"
            echo "  status        - Check deployment status"
            echo ""
            echo "Examples:"
            echo "  $0 quick"
            echo "  $0 logs knowledge-assistant-backend 100"
            echo "  $0 status knowledge-assistant-frontend"
            exit 1
            ;;
    esac
}

main "$@"