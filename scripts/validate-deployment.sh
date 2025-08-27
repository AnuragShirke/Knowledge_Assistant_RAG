#!/bin/bash

# Deployment Validation Script
# This script validates that all services are properly deployed and functional

set -e

# Source deployment utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deployment-utils.sh"

# Configuration
VALIDATION_TIMEOUT=300  # 5 minutes
TEST_USER_EMAIL="test@example.com"
TEST_USER_PASSWORD="testpassword123"

# Validation results
declare -A VALIDATION_RESULTS

# Test user registration
test_user_registration() {
    local backend_url=$1
    
    log "Testing user registration..."
    
    local response
    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_USER_EMAIL\",\"password\":\"$TEST_USER_PASSWORD\"}" \
        "$backend_url/auth/register" 2>/dev/null || echo "000")
    
    local status_code="${response: -3}"
    local body="${response%???}"
    
    case $status_code in
        201)
            success "User registration successful"
            VALIDATION_RESULTS["User Registration"]="PASS"
            return 0
            ;;
        400)
            if echo "$body" | grep -q "already exists"; then
                success "User registration validation passed (user already exists)"
                VALIDATION_RESULTS["User Registration"]="PASS"
                return 0
            else
                error "User registration failed: $body"
                VALIDATION_RESULTS["User Registration"]="FAIL"
                return 1
            fi
            ;;
        *)
            error "User registration failed with HTTP $status_code: $body"
            VALIDATION_RESULTS["User Registration"]="FAIL"
            return 1
            ;;
    esac
}

# Test user login
test_user_login() {
    local backend_url=$1
    
    log "Testing user login..."
    
    local response
    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_USER_EMAIL\",\"password\":\"$TEST_USER_PASSWORD\"}" \
        "$backend_url/auth/jwt/login" 2>/dev/null || echo "000")
    
    local status_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$status_code" = "200" ]; then
        # Extract JWT token
        JWT_TOKEN=$(echo "$body" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
        
        if [ -n "$JWT_TOKEN" ]; then
            success "User login successful, JWT token obtained"
            VALIDATION_RESULTS["User Login"]="PASS"
            return 0
        else
            error "User login failed: No JWT token in response"
            VALIDATION_RESULTS["User Login"]="FAIL"
            return 1
        fi
    else
        error "User login failed with HTTP $status_code: $body"
        VALIDATION_RESULTS["User Login"]="FAIL"
        return 1
    fi
}

# Test document upload
test_document_upload() {
    local backend_url=$1
    local jwt_token=$2
    
    log "Testing document upload..."
    
    # Create a test document
    local test_doc="/tmp/test_document.txt"
    echo "This is a test document for validation purposes. It contains sample text to test the RAG functionality." > "$test_doc"
    
    local response
    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Authorization: Bearer $jwt_token" \
        -F "file=@$test_doc" \
        "$backend_url/upload" 2>/dev/null || echo "000")
    
    local status_code="${response: -3}"
    local body="${response%???}"
    
    # Clean up test file
    rm -f "$test_doc"
    
    if [ "$status_code" = "200" ]; then
        success "Document upload successful"
        VALIDATION_RESULTS["Document Upload"]="PASS"
        return 0
    else
        error "Document upload failed with HTTP $status_code: $body"
        VALIDATION_RESULTS["Document Upload"]="FAIL"
        return 1
    fi
}

# Test query functionality
test_query_functionality() {
    local backend_url=$1
    local jwt_token=$2
    
    log "Testing query functionality..."
    
    local test_query="What is this document about?"
    
    local response
    response=$(curl -s -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $jwt_token" \
        -d "{\"query\":\"$test_query\"}" \
        "$backend_url/query" 2>/dev/null || echo "000")
    
    local status_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$status_code" = "200" ]; then
        if echo "$body" | grep -q "response"; then
            success "Query functionality successful"
            VALIDATION_RESULTS["Query Functionality"]="PASS"
            return 0
        else
            error "Query functionality failed: No response in body"
            VALIDATION_RESULTS["Query Functionality"]="FAIL"
            return 1
        fi
    else
        error "Query functionality failed with HTTP $status_code: $body"
        VALIDATION_RESULTS["Query Functionality"]="FAIL"
        return 1
    fi
}

# Test frontend accessibility
test_frontend_accessibility() {
    local frontend_url=$1
    
    log "Testing frontend accessibility..."
    
    local response
    response=$(curl -s -w "%{http_code}" "$frontend_url" 2>/dev/null || echo "000")
    
    local status_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$status_code" = "200" ]; then
        if echo "$body" | grep -q -i "knowledge.*assistant\|rag\|react"; then
            success "Frontend is accessible and appears to be the correct application"
            VALIDATION_RESULTS["Frontend Accessibility"]="PASS"
            return 0
        else
            warning "Frontend is accessible but content validation failed"
            VALIDATION_RESULTS["Frontend Accessibility"]="PARTIAL"
            return 0
        fi
    else
        error "Frontend accessibility failed with HTTP $status_code"
        VALIDATION_RESULTS["Frontend Accessibility"]="FAIL"
        return 1
    fi
}

# Test API documentation
test_api_documentation() {
    local backend_url=$1
    
    log "Testing API documentation accessibility..."
    
    local response
    response=$(curl -s -w "%{http_code}" "$backend_url/docs" 2>/dev/null || echo "000")
    
    local status_code="${response: -3}"
    
    if [ "$status_code" = "200" ]; then
        success "API documentation is accessible"
        VALIDATION_RESULTS["API Documentation"]="PASS"
        return 0
    else
        warning "API documentation not accessible (HTTP $status_code)"
        VALIDATION_RESULTS["API Documentation"]="FAIL"
        return 1
    fi
}

# Test database connectivity
test_database_connectivity() {
    local backend_url=$1
    
    log "Testing database connectivity through API..."
    
    # Test health endpoint which should check database
    local response
    response=$(curl -s -w "%{http_code}" "$backend_url/health" 2>/dev/null || echo "000")
    
    local status_code="${response: -3}"
    local body="${response%???}"
    
    if [ "$status_code" = "200" ]; then
        if echo "$body" | grep -q -i "database\|db"; then
            success "Database connectivity test passed"
            VALIDATION_RESULTS["Database Connectivity"]="PASS"
            return 0
        else
            warning "Database connectivity status unclear from health endpoint"
            VALIDATION_RESULTS["Database Connectivity"]="PARTIAL"
            return 0
        fi
    else
        error "Database connectivity test failed (health endpoint returned $status_code)"
        VALIDATION_RESULTS["Database Connectivity"]="FAIL"
        return 1
    fi
}

# Test Qdrant connectivity
test_qdrant_connectivity() {
    local qdrant_url=$1
    
    log "Testing Qdrant connectivity..."
    
    local response
    response=$(curl -s -w "%{http_code}" "$qdrant_url/health" 2>/dev/null || echo "000")
    
    local status_code="${response: -3}"
    
    if [ "$status_code" = "200" ]; then
        success "Qdrant connectivity test passed"
        VALIDATION_RESULTS["Qdrant Connectivity"]="PASS"
        return 0
    else
        error "Qdrant connectivity test failed (HTTP $status_code)"
        VALIDATION_RESULTS["Qdrant Connectivity"]="FAIL"
        return 1
    fi
}

# Test external API connectivity
test_external_api_connectivity() {
    local backend_url=$1
    
    log "Testing external API connectivity..."
    
    # This would typically be tested through the query endpoint
    # For now, we'll check if the environment variables are set
    if [ -n "$GEMINI_API_KEY" ]; then
        success "Google Gemini API key is configured"
        VALIDATION_RESULTS["External API Config"]="PASS"
    elif [ -n "$OPENAI_API_KEY" ]; then
        success "OpenAI API key is configured"
        VALIDATION_RESULTS["External API Config"]="PASS"
    else
        warning "No external API keys configured"
        VALIDATION_RESULTS["External API Config"]="FAIL"
    fi
}

# Performance test
test_performance() {
    local backend_url=$1
    local jwt_token=$2
    
    log "Running basic performance test..."
    
    local start_time
    local end_time
    local duration
    
    start_time=$(date +%s.%N)
    
    # Simple health check for performance measurement
    curl -s "$backend_url/health" > /dev/null
    
    end_time=$(date +%s.%N)
    duration=$(echo "$end_time - $start_time" | bc)
    
    if (( $(echo "$duration < 2.0" | bc -l) )); then
        success "Performance test passed (${duration}s response time)"
        VALIDATION_RESULTS["Performance"]="PASS"
    elif (( $(echo "$duration < 5.0" | bc -l) )); then
        warning "Performance test marginal (${duration}s response time)"
        VALIDATION_RESULTS["Performance"]="PARTIAL"
    else
        error "Performance test failed (${duration}s response time)"
        VALIDATION_RESULTS["Performance"]="FAIL"
    fi
}

# Generate validation report
generate_validation_report() {
    echo ""
    echo "=================================="
    echo "    DEPLOYMENT VALIDATION REPORT"
    echo "=================================="
    echo "Timestamp: $(date)"
    echo ""
    
    local pass_count=0
    local fail_count=0
    local partial_count=0
    
    for test in "${!VALIDATION_RESULTS[@]}"; do
        local result="${VALIDATION_RESULTS[$test]}"
        local result_icon=""
        
        case $result in
            "PASS")
                result_icon="✅"
                pass_count=$((pass_count + 1))
                ;;
            "FAIL")
                result_icon="❌"
                fail_count=$((fail_count + 1))
                ;;
            "PARTIAL")
                result_icon="⚠️ "
                partial_count=$((partial_count + 1))
                ;;
        esac
        
        printf "%-25s %s %s\n" "$test" "$result_icon" "$result"
    done
    
    echo ""
    echo "Summary:"
    echo "  Passed: $pass_count"
    echo "  Failed: $fail_count"
    echo "  Partial: $partial_count"
    echo ""
    
    # Overall validation status
    if [ $fail_count -eq 0 ] && [ $partial_count -eq 0 ]; then
        success "Overall deployment validation: EXCELLENT"
        return 0
    elif [ $fail_count -eq 0 ]; then
        warning "Overall deployment validation: GOOD (with warnings)"
        return 0
    elif [ $fail_count -le 2 ]; then
        warning "Overall deployment validation: ACCEPTABLE (minor issues)"
        return 1
    else
        error "Overall deployment validation: FAILED (major issues)"
        return 2
    fi
}

# Main validation function
main() {
    local backend_url=""
    local frontend_url=""
    local qdrant_url=""
    local env_file=""
    local skip_functional=false
    local output_file=""
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backend-url)
                backend_url="$2"
                shift 2
                ;;
            --frontend-url)
                frontend_url="$2"
                shift 2
                ;;
            --qdrant-url)
                qdrant_url="$2"
                shift 2
                ;;
            --env-file)
                env_file="$2"
                shift 2
                ;;
            --skip-functional)
                skip_functional=true
                shift
                ;;
            --output)
                output_file="$2"
                shift 2
                ;;
            --help)
                echo "Deployment Validation Script for Knowledge Assistant RAG"
                echo ""
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --backend-url URL      Backend service URL"
                echo "  --frontend-url URL     Frontend service URL"
                echo "  --qdrant-url URL       Qdrant service URL"
                echo "  --env-file FILE        Environment file to load"
                echo "  --skip-functional      Skip functional tests"
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
    
    log "Starting deployment validation..."
    
    # Load environment variables
    if [ -n "$env_file" ] && [ -f "$env_file" ]; then
        source "$env_file"
    elif [ -f ".env" ]; then
        source ".env"
    fi
    
    # Use default URLs if not provided
    backend_url=${backend_url:-${BACKEND_URL:-"http://localhost:8000"}}
    frontend_url=${frontend_url:-${FRONTEND_URL:-"http://localhost:3000"}}
    qdrant_url=${qdrant_url:-"http://${QDRANT_HOST:-localhost}:${QDRANT_PORT:-6333}"}
    
    log "Validating deployment with:"
    log "  Backend URL: $backend_url"
    log "  Frontend URL: $frontend_url"
    log "  Qdrant URL: $qdrant_url"
    
    # Wait for services to be ready
    wait_for_service "$backend_url/health" 60 5 "Backend"
    wait_for_service "$frontend_url" 30 5 "Frontend"
    wait_for_service "$qdrant_url/health" 30 5 "Qdrant"
    
    # Run validation tests
    test_frontend_accessibility "$frontend_url"
    test_api_documentation "$backend_url"
    test_database_connectivity "$backend_url"
    test_qdrant_connectivity "$qdrant_url"
    test_external_api_connectivity "$backend_url"
    
    if [ "$skip_functional" != true ]; then
        # Run functional tests
        if test_user_registration "$backend_url"; then
            if test_user_login "$backend_url"; then
                test_document_upload "$backend_url" "$JWT_TOKEN"
                test_query_functionality "$backend_url" "$JWT_TOKEN"
                test_performance "$backend_url" "$JWT_TOKEN"
            fi
        fi
    fi
    
    # Generate and display report
    local report_output
    report_output=$(generate_validation_report)
    echo "$report_output"
    
    # Save to file if requested
    if [ -n "$output_file" ]; then
        echo "$report_output" > "$output_file"
        success "Validation report saved to $output_file"
    fi
    
    # Return appropriate exit code based on validation results
    local exit_code=$?
    return $exit_code
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi