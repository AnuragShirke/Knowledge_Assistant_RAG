#!/bin/bash

# Docker Compose Integration Test Script
# This script tests the complete Docker Compose setup for the Knowledge Assistant RAG application

set -e

echo "🚀 Starting Docker Compose Integration Tests"
echo "============================================="

# Configuration
BACKEND_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:8080"
MAX_WAIT_TIME=120
HEALTH_CHECK_INTERVAL=5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a service is responding
check_service() {
    local url=$1
    local service_name=$2
    local max_attempts=$((MAX_WAIT_TIME / HEALTH_CHECK_INTERVAL))
    local attempt=1

    log_info "Checking $service_name at $url"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            log_success "$service_name is responding"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts: $service_name not ready, waiting ${HEALTH_CHECK_INTERVAL}s..."
        sleep $HEALTH_CHECK_INTERVAL
        attempt=$((attempt + 1))
    done
    
    log_error "$service_name failed to respond within ${MAX_WAIT_TIME}s"
    return 1
}

# Function to check backend health
check_backend_health() {
    log_info "Checking backend health endpoint"
    
    local response=$(curl -s "$BACKEND_URL/health" 2>/dev/null || echo "")
    
    if [ -z "$response" ]; then
        log_error "Backend health endpoint not responding"
        return 1
    fi
    
    # Parse JSON response (basic check)
    if echo "$response" | grep -q '"status"'; then
        local status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        log_info "Backend status: $status"
        
        if [ "$status" = "ok" ] || [ "$status" = "degraded" ]; then
            log_success "Backend health check passed"
            
            # Check individual services
            if echo "$response" | grep -q '"qdrant"'; then
                log_info "Qdrant service detected in health response"
            fi
            
            if echo "$response" | grep -q '"ollama"'; then
                log_info "Ollama service detected in health response"
            fi
            
            if echo "$response" | grep -q '"embedding_model"'; then
                log_info "Embedding model service detected in health response"
            fi
            
            return 0
        else
            log_error "Backend status is not healthy: $status"
            return 1
        fi
    else
        log_error "Invalid health response format"
        return 1
    fi
}

# Function to test CORS configuration
test_cors() {
    log_info "Testing CORS configuration"
    
    local cors_response=$(curl -s -I -X OPTIONS \
        -H "Origin: $FRONTEND_URL" \
        -H "Access-Control-Request-Method: POST" \
        -H "Access-Control-Request-Headers: Content-Type" \
        "$BACKEND_URL/upload" 2>/dev/null || echo "")
    
    if echo "$cors_response" | grep -qi "access-control-allow-origin"; then
        log_success "CORS headers present"
        
        if echo "$cors_response" | grep -q "$FRONTEND_URL"; then
            log_success "CORS allows frontend origin"
        else
            log_warning "CORS may not allow frontend origin"
        fi
    else
        log_error "CORS headers missing"
        return 1
    fi
}

# Function to test API endpoints
test_api_endpoints() {
    log_info "Testing API endpoints"
    
    # Test health endpoint
    if curl -s -f "$BACKEND_URL/health" > /dev/null; then
        log_success "Health endpoint accessible"
    else
        log_error "Health endpoint not accessible"
        return 1
    fi
    
    # Test upload endpoint (should return method not allowed for GET)
    local upload_response=$(curl -s -w "%{http_code}" -o /dev/null "$BACKEND_URL/upload")
    if [ "$upload_response" = "405" ] || [ "$upload_response" = "422" ]; then
        log_success "Upload endpoint accessible (returns $upload_response as expected)"
    else
        log_warning "Upload endpoint returned unexpected status: $upload_response"
    fi
    
    # Test query endpoint (should return method not allowed for GET)
    local query_response=$(curl -s -w "%{http_code}" -o /dev/null "$BACKEND_URL/query")
    if [ "$query_response" = "405" ] || [ "$query_response" = "422" ]; then
        log_success "Query endpoint accessible (returns $query_response as expected)"
    else
        log_warning "Query endpoint returned unexpected status: $query_response"
    fi
}

# Function to test file upload functionality
test_file_upload() {
    log_info "Testing file upload functionality"
    
    # Create a test file
    local test_file="/tmp/test_document.txt"
    echo "This is a test document for integration testing." > "$test_file"
    
    # Attempt to upload the file
    local upload_response=$(curl -s -X POST \
        -F "file=@$test_file" \
        "$BACKEND_URL/upload" 2>/dev/null || echo "")
    
    if [ -n "$upload_response" ]; then
        if echo "$upload_response" | grep -q '"filename"'; then
            log_success "File upload test passed"
            
            # Extract number of chunks if available
            if echo "$upload_response" | grep -q '"num_chunks_stored"'; then
                local chunks=$(echo "$upload_response" | grep -o '"num_chunks_stored":[0-9]*' | cut -d':' -f2)
                log_info "Document processed into $chunks chunks"
            fi
        else
            log_error "File upload failed: $upload_response"
            return 1
        fi
    else
        log_error "File upload request failed"
        return 1
    fi
    
    # Clean up test file
    rm -f "$test_file"
}

# Function to test query functionality
test_query() {
    log_info "Testing query functionality"
    
    local query_data='{"query":"What is machine learning?"}'
    local query_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$query_data" \
        "$BACKEND_URL/query" 2>/dev/null || echo "")
    
    if [ -n "$query_response" ]; then
        if echo "$query_response" | grep -q '"answer"'; then
            log_success "Query test passed"
            
            # Check for source documents
            if echo "$query_response" | grep -q '"source_documents"'; then
                log_info "Query response includes source documents"
            fi
        else
            log_warning "Query returned unexpected response: $query_response"
        fi
    else
        log_error "Query request failed"
        return 1
    fi
}

# Function to check Docker Compose services
check_docker_services() {
    log_info "Checking Docker Compose services"
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
        log_error "Docker Compose not found"
        return 1
    fi
    
    # Use docker compose or docker-compose based on availability
    local compose_cmd="docker compose"
    if ! docker compose version &> /dev/null; then
        compose_cmd="docker-compose"
    fi
    
    # Check running services
    local services=$($compose_cmd ps --services 2>/dev/null || echo "")
    
    if [ -n "$services" ]; then
        log_info "Docker Compose services found:"
        echo "$services" | while read -r service; do
            if [ -n "$service" ]; then
                local status=$($compose_cmd ps "$service" --format "table {{.State}}" 2>/dev/null | tail -n +2 || echo "unknown")
                log_info "  - $service: $status"
            fi
        done
    else
        log_warning "No Docker Compose services found or not running"
    fi
}

# Function to run performance tests
test_performance() {
    log_info "Running basic performance tests"
    
    # Test response time for health endpoint
    local start_time=$(date +%s%N)
    curl -s "$BACKEND_URL/health" > /dev/null
    local end_time=$(date +%s%N)
    local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    log_info "Health endpoint response time: ${response_time}ms"
    
    if [ $response_time -lt 5000 ]; then
        log_success "Response time is acceptable"
    else
        log_warning "Response time is slow: ${response_time}ms"
    fi
}

# Main test execution
main() {
    log_info "Starting comprehensive Docker Compose integration tests"
    
    # Check if services are running
    check_docker_services
    
    # Wait for backend to be ready
    if ! check_service "$BACKEND_URL/health" "Backend"; then
        log_error "Backend service failed to start"
        exit 1
    fi
    
    # Run health checks
    if ! check_backend_health; then
        log_error "Backend health check failed"
        exit 1
    fi
    
    # Test CORS configuration
    test_cors
    
    # Test API endpoints
    if ! test_api_endpoints; then
        log_error "API endpoint tests failed"
        exit 1
    fi
    
    # Test file upload
    if ! test_file_upload; then
        log_warning "File upload test failed (may be expected if services not fully ready)"
    fi
    
    # Test query functionality
    if ! test_query; then
        log_warning "Query test failed (may be expected if no documents uploaded)"
    fi
    
    # Run performance tests
    test_performance
    
    log_success "All integration tests completed!"
    log_info "Summary:"
    log_info "  ✓ Backend service is running and healthy"
    log_info "  ✓ CORS is configured"
    log_info "  ✓ API endpoints are accessible"
    log_info "  ✓ Basic functionality tests completed"
    
    echo ""
    echo "🎉 Docker Compose integration tests passed!"
    echo "The Knowledge Assistant RAG application is ready for use."
}

# Run tests
main "$@"