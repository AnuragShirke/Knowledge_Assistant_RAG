#!/bin/bash

# Railway Health Check Script
# Validates deployment health and service connectivity

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_SERVICE="backend"
FRONTEND_SERVICE="frontend"
TIMEOUT=30

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

# Check if Railway CLI is available
check_railway_cli() {
    if ! command -v railway &> /dev/null; then
        error "Railway CLI is not installed"
        exit 1
    fi
}

# Get service URL
get_service_url() {
    local service_name=$1
    railway service use "$service_name" &> /dev/null
    local domain=$(railway domain 2>/dev/null | head -n1)
    if [ -n "$domain" ]; then
        echo "https://$domain"
    else
        echo ""
    fi
}

# Test HTTP endpoint
test_endpoint() {
    local url=$1
    local description=$2
    local expected_status=${3:-200}
    
    log "Testing $description: $url"
    
    local response=$(curl -s -w "%{http_code}" -o /dev/null --max-time $TIMEOUT "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        success "$description is healthy (HTTP $response)"
        return 0
    else
        error "$description failed (HTTP $response)"
        return 1
    fi
}

# Test JSON API endpoint
test_json_endpoint() {
    local url=$1
    local description=$2
    
    log "Testing $description: $url"
    
    local response=$(curl -s --max-time $TIMEOUT -H "Accept: application/json" "$url" 2>/dev/null)
    local status=$?
    
    if [ $status -eq 0 ] && echo "$response" | jq . &> /dev/null; then
        success "$description returned valid JSON"
        return 0
    else
        error "$description failed or returned invalid JSON"
        return 1
    fi
}

# Test backend health
test_backend_health() {
    log "Testing backend service health..."
    
    local backend_url=$(get_service_url "$BACKEND_SERVICE")
    if [ -z "$backend_url" ]; then
        error "Backend URL not available"
        return 1
    fi
    
    log "Backend URL: $backend_url"
    
    # Test basic connectivity
    test_endpoint "$backend_url" "Backend root endpoint" || return 1
    
    # Test health endpoint
    test_json_endpoint "$backend_url/health" "Backend health endpoint" || return 1
    
    # Test API docs
    test_endpoint "$backend_url/docs" "Backend API documentation" || return 1
    
    # Test OpenAPI spec
    test_json_endpoint "$backend_url/openapi.json" "Backend OpenAPI specification" || return 1
    
    success "Backend service is healthy"
    return 0
}

# Test frontend health
test_frontend_health() {
    log "Testing frontend service health..."
    
    local frontend_url=$(get_service_url "$FRONTEND_SERVICE")
    if [ -z "$frontend_url" ]; then
        error "Frontend URL not available"
        return 1
    fi
    
    log "Frontend URL: $frontend_url"
    
    # Test basic connectivity
    test_endpoint "$frontend_url" "Frontend application" || return 1
    
    # Test static assets (common paths)
    test_endpoint "$frontend_url/assets" "Frontend assets" 404  # 404 is expected for directory listing
    
    success "Frontend service is healthy"
    return 0
}

# Test service connectivity
test_service_connectivity() {
    log "Testing service connectivity..."
    
    local backend_url=$(get_service_url "$BACKEND_SERVICE")
    local frontend_url=$(get_service_url "$FRONTEND_SERVICE")
    
    if [ -z "$backend_url" ] || [ -z "$frontend_url" ]; then
        warning "Cannot test connectivity - missing service URLs"
        return 1
    fi
    
    # Test CORS by checking if frontend can reach backend
    # This is a simplified test - in reality, CORS is tested by the browser
    log "Testing backend accessibility from frontend domain..."
    
    # Check if backend allows the frontend origin
    local cors_test=$(curl -s -H "Origin: $frontend_url" -H "Access-Control-Request-Method: GET" -X OPTIONS "$backend_url/health" -w "%{http_code}" -o /dev/null 2>/dev/null || echo "000")
    
    if [ "$cors_test" = "200" ] || [ "$cors_test" = "204" ]; then
        success "CORS configuration appears correct"
    else
        warning "CORS configuration may need adjustment (HTTP $cors_test)"
    fi
    
    return 0
}

# Test database connectivity
test_database_connectivity() {
    log "Testing database connectivity..."
    
    local backend_url=$(get_service_url "$BACKEND_SERVICE")
    if [ -z "$backend_url" ]; then
        error "Backend URL not available for database test"
        return 1
    fi
    
    # Test database health through backend API
    # This assumes the backend has a database health check endpoint
    local db_health=$(curl -s --max-time $TIMEOUT "$backend_url/health" 2>/dev/null | jq -r '.database // "unknown"' 2>/dev/null || echo "unknown")
    
    if [ "$db_health" = "healthy" ] || [ "$db_health" = "ok" ]; then
        success "Database connectivity is healthy"
    elif [ "$db_health" = "unknown" ]; then
        warning "Database health status unknown"
    else
        error "Database connectivity issues detected"
        return 1
    fi
    
    return 0
}

# Generate health report
generate_health_report() {
    log "Generating health report..."
    
    local backend_url=$(get_service_url "$BACKEND_SERVICE")
    local frontend_url=$(get_service_url "$FRONTEND_SERVICE")
    
    echo ""
    echo "=== Railway Deployment Health Report ==="
    echo "Generated: $(date)"
    echo ""
    
    if [ -n "$backend_url" ]; then
        echo "Backend Service:"
        echo "  URL: $backend_url"
        echo "  Health: $backend_url/health"
        echo "  API Docs: $backend_url/docs"
    else
        echo "Backend Service: NOT AVAILABLE"
    fi
    
    echo ""
    
    if [ -n "$frontend_url" ]; then
        echo "Frontend Service:"
        echo "  URL: $frontend_url"
    else
        echo "Frontend Service: NOT AVAILABLE"
    fi
    
    echo ""
    echo "Service Status:"
    railway service use "$BACKEND_SERVICE" &> /dev/null
    echo "  Backend: $(railway status --json 2>/dev/null | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")"
    
    railway service use "$FRONTEND_SERVICE" &> /dev/null
    echo "  Frontend: $(railway status --json 2>/dev/null | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")"
    
    echo ""
    echo "Recent Logs (last 10 lines):"
    echo "Backend:"
    railway service use "$BACKEND_SERVICE" &> /dev/null
    railway logs --tail 10 2>/dev/null | sed 's/^/  /' || echo "  Logs not available"
    
    echo ""
    echo "Frontend:"
    railway service use "$FRONTEND_SERVICE" &> /dev/null
    railway logs --tail 10 2>/dev/null | sed 's/^/  /' || echo "  Logs not available"
}

# Main health check function
main() {
    log "Starting Railway deployment health check..."
    
    check_railway_cli
    
    local failed_tests=0
    
    # Run health tests
    test_backend_health || ((failed_tests++))
    test_frontend_health || ((failed_tests++))
    test_service_connectivity || ((failed_tests++))
    test_database_connectivity || ((failed_tests++))
    
    # Generate report
    generate_health_report
    
    echo ""
    if [ $failed_tests -eq 0 ]; then
        success "All health checks passed!"
        exit 0
    else
        error "$failed_tests health check(s) failed"
        echo ""
        echo "Troubleshooting tips:"
        echo "1. Check Railway dashboard for service status"
        echo "2. Review service logs: railway logs --service <service-name>"
        echo "3. Verify environment variables: railway variables"
        echo "4. Check resource usage and limits"
        echo "5. Ensure all services are deployed and running"
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Railway Health Check Script"
        echo ""
        echo "Usage: $0 [options]"
        echo ""
        echo "Options:"
        echo "  --help, -h      Show this help message"
        echo "  --backend-only  Check only backend service"
        echo "  --frontend-only Check only frontend service"
        echo "  --report-only   Generate health report only"
        echo ""
        exit 0
        ;;
    --backend-only)
        check_railway_cli
        test_backend_health
        ;;
    --frontend-only)
        check_railway_cli
        test_frontend_health
        ;;
    --report-only)
        check_railway_cli
        generate_health_report
        ;;
    "")
        main
        ;;
    *)
        error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac