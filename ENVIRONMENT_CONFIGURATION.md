# Environment Variables and Secrets Configuration Guide

This guide provides comprehensive documentation for configuring environment variables and managing secrets across all deployment platforms for the Knowledge Assistant RAG application.

## Table of Contents

1. [Core Environment Variables](#core-environment-variables)
2. [Platform-Specific Configuration](#platform-specific-configuration)
3. [Secrets Management](#secrets-management)
4. [Environment Templates](#environment-templates)
5. [Validation and Testing](#validation-and-testing)
6. [Security Best Practices](#security-best-practices)
7. [Troubleshooting](#troubleshooting)

## Core Environment Variables

### Required Variables

#### Authentication & Security
```bash
# JWT Secret Key (REQUIRED)
# Must be at least 32 characters long
# Generate with: openssl rand -base64 32
JWT_SECRET=your-super-secure-jwt-secret-key-32-chars-minimum

# User Registration Control
USER_REGISTRATION_ENABLED=true  # or false to disable new registrations
```

#### Database Configuration
```bash
# SQLite (Default)
DATABASE_URL=sqlite+aiosqlite:///./data/knowledge_assistant.db

# PostgreSQL (Production)
DATABASE_URL=postgresql://username:password@host:port/database_name

# PostgreSQL with SSL (Cloud deployments)
DATABASE_URL=postgresql://username:password@host:port/database_name?sslmode=require
```

#### Vector Database (Qdrant)
```bash
# Self-hosted Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333

# Qdrant Cloud
QDRANT_CLOUD_URL=https://your-cluster-id.qdrant.io
QDRANT_API_KEY=your-qdrant-cloud-api-key
```

#### LLM Service Configuration
```bash
# Google Gemini API (Recommended)
GEMINI_API_KEY=your-google-gemini-api-key

# OpenAI API (Alternative)
OPENAI_API_KEY=your-openai-api-key
USE_OPENAI_INSTEAD_OF_GEMINI=false  # Set to true to use OpenAI
```

#### CORS Configuration
```bash
# Frontend Origins (comma-separated)
CORS_ORIGINS=https://your-frontend-domain.com,http://localhost:3000

# For development
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

### Optional Variables

#### Application Configuration
```bash
# Server Configuration
PORT=8000
HOST=0.0.0.0
WORKERS=1

# Logging
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_FORMAT=json  # json or text

# File Upload Limits
MAX_FILE_SIZE=10485760  # 10MB in bytes
ALLOWED_FILE_TYPES=pdf,txt,docx,md

# Query Configuration
MAX_QUERY_LENGTH=1000
DEFAULT_SEARCH_LIMIT=10
```

#### Performance Tuning
```bash
# Database Connection Pool
DB_POOL_SIZE=5
DB_MAX_OVERFLOW=10
DB_POOL_TIMEOUT=30

# Vector Search Configuration
VECTOR_SEARCH_TOP_K=5
EMBEDDING_BATCH_SIZE=100

# API Timeouts
API_TIMEOUT=30
GEMINI_TIMEOUT=30
QDRANT_TIMEOUT=10
```

### Frontend Environment Variables

#### React/Vite Configuration
```bash
# API Configuration
VITE_API_BASE_URL=https://your-backend-domain.com
VITE_API_TIMEOUT=30000

# Feature Flags
VITE_ENABLE_REGISTRATION=true
VITE_ENABLE_FILE_UPLOAD=true
VITE_ENABLE_DARK_MODE=true

# Analytics (Optional)
VITE_GOOGLE_ANALYTICS_ID=GA_MEASUREMENT_ID
VITE_SENTRY_DSN=your-sentry-dsn
```

## Platform-Specific Configuration

### Railway Configuration

#### Environment File: `.env.railway`
```bash
# Railway-specific variables
RAILWAY_ENVIRONMENT=production
PORT=8000

# Database (Railway PostgreSQL)
DATABASE_URL=$DATABASE_URL  # Automatically provided by Railway

# External Services (Recommended for free tier)
QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
GEMINI_API_KEY=your-gemini-api-key

# Security
JWT_SECRET=your-jwt-secret-32-chars-minimum

# CORS
CORS_ORIGINS=https://your-app.railway.app

# Frontend
VITE_API_BASE_URL=https://your-backend.railway.app
```

#### Setting Variables via CLI
```bash
# Login to Railway
railway login

# Set environment variables
railway variables set JWT_SECRET="$(openssl rand -base64 32)"
railway variables set GEMINI_API_KEY="your-gemini-api-key"
railway variables set USER_REGISTRATION_ENABLED="true"
railway variables set CORS_ORIGINS="https://your-frontend.railway.app"

# Frontend variables
cd rag-quest-hub
railway variables set VITE_API_BASE_URL="https://your-backend.railway.app"
railway variables set VITE_ENABLE_REGISTRATION="true"
```

### Fly.io Configuration

#### Environment File: `.env.fly`
```bash
# Fly.io specific
FLY_APP_NAME=knowledge-assistant-rag
FLY_REGION=ord

# Database
DATABASE_URL=sqlite+aiosqlite:///./data/knowledge_assistant.db

# Services
QDRANT_HOST=localhost
QDRANT_PORT=6333

# External APIs
GEMINI_API_KEY=your-gemini-api-key

# Security
JWT_SECRET=your-jwt-secret

# CORS
CORS_ORIGINS=https://your-app.fly.dev
```

#### Setting Secrets via CLI
```bash
# Set secrets
flyctl secrets set JWT_SECRET="$(openssl rand -base64 32)"
flyctl secrets set GEMINI_API_KEY="your-gemini-api-key"

# Set regular environment variables in fly.toml
[env]
  USER_REGISTRATION_ENABLED = "true"
  CORS_ORIGINS = "https://your-app.fly.dev"
  DATABASE_URL = "sqlite+aiosqlite:///./data/knowledge_assistant.db"
```

### Google Cloud Run Configuration

#### Environment File: `.env.cloudrun`
```bash
# Google Cloud Project
PROJECT_ID=your-gcp-project-id
REGION=us-central1

# Database (Cloud SQL)
DATABASE_URL=postgresql://user:pass@/db?host=/cloudsql/project:region:instance

# Services
QDRANT_HOST=knowledge-assistant-qdrant-hash-uc.a.run.app
QDRANT_PORT=443

# External APIs
GEMINI_API_KEY=your-gemini-api-key

# Security (stored in Secret Manager)
JWT_SECRET=projects/PROJECT_ID/secrets/jwt-secret/versions/latest

# CORS
CORS_ORIGINS=https://knowledge-assistant-frontend-hash-uc.a.run.app
```

#### Setting Variables via CLI
```bash
# Create secrets in Secret Manager
echo -n "$(openssl rand -base64 32)" | gcloud secrets create jwt-secret --data-file=-
echo -n "your-gemini-api-key" | gcloud secrets create gemini-api-key --data-file=-

# Update Cloud Run service with environment variables
gcloud run services update knowledge-assistant-backend \
  --region=us-central1 \
  --set-env-vars="USER_REGISTRATION_ENABLED=true" \
  --set-env-vars="CORS_ORIGINS=https://your-frontend-url.com"

# Update with secrets
gcloud run services update knowledge-assistant-backend \
  --region=us-central1 \
  --set-secrets="JWT_SECRET=jwt-secret:latest" \
  --set-secrets="GEMINI_API_KEY=gemini-api-key:latest"
```

### Vercel Configuration

#### Environment File: `.env.vercel`
```bash
# Vercel-specific
VERCEL_ENV=production

# External Services (All external for serverless)
DATABASE_URL=postgresql://user:pass@host:port/db
QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
GEMINI_API_KEY=your-gemini-api-key

# Security
JWT_SECRET=your-jwt-secret

# CORS
CORS_ORIGINS=https://your-app.vercel.app

# Frontend
VITE_API_BASE_URL=https://your-app.vercel.app/api
```

#### Setting Variables via CLI
```bash
# Set environment variables
vercel env add JWT_SECRET production
vercel env add GEMINI_API_KEY production
vercel env add DATABASE_URL production
vercel env add QDRANT_CLOUD_URL production
vercel env add QDRANT_API_KEY production

# Frontend variables
vercel env add VITE_API_BASE_URL production
vercel env add VITE_ENABLE_REGISTRATION production
```

## Secrets Management

### Secret Generation

#### JWT Secret Generation
```bash
# Method 1: OpenSSL
openssl rand -base64 32

# Method 2: Python
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Method 3: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Validation: Ensure at least 32 characters
echo "your-jwt-secret" | wc -c
```

#### API Key Management
```bash
# Google Gemini API Key
# 1. Visit https://makersuite.google.com/app/apikey
# 2. Create new API key
# 3. Copy and store securely

# Qdrant Cloud API Key
# 1. Visit https://cloud.qdrant.io
# 2. Create cluster
# 3. Generate API key from dashboard
```

### Platform-Specific Secret Storage

#### Railway Secrets
```bash
# Set via CLI
railway variables set SECRET_NAME="secret_value"

# Set via web dashboard
# 1. Visit railway.app
# 2. Select your project
# 3. Go to Variables tab
# 4. Add environment variable
```

#### Fly.io Secrets
```bash
# Set secrets (encrypted at rest)
flyctl secrets set SECRET_NAME="secret_value"

# List secrets (values hidden)
flyctl secrets list

# Remove secrets
flyctl secrets unset SECRET_NAME
```

#### Google Cloud Secret Manager
```bash
# Create secret
echo -n "secret_value" | gcloud secrets create secret-name --data-file=-

# Grant access to service account
gcloud secrets add-iam-policy-binding secret-name \
  --member="serviceAccount:service-account@project.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Use in Cloud Run
gcloud run services update service-name \
  --set-secrets="ENV_VAR=secret-name:latest"
```

#### Vercel Environment Variables
```bash
# Set via CLI
vercel env add SECRET_NAME

# Set via web dashboard
# 1. Visit vercel.com
# 2. Select your project
# 3. Go to Settings > Environment Variables
# 4. Add variable with appropriate environment
```

## Environment Templates

### Development Template (`.env.development`)
```bash
# Development Configuration
NODE_ENV=development
DEBUG=true
LOG_LEVEL=DEBUG

# Database
DATABASE_URL=sqlite+aiosqlite:///./data/knowledge_assistant_dev.db

# Services (Local)
QDRANT_HOST=localhost
QDRANT_PORT=6333

# External APIs
GEMINI_API_KEY=your-dev-gemini-api-key

# Security (Use different secret for dev)
JWT_SECRET=development-jwt-secret-32-chars-minimum

# CORS (Allow local development)
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Frontend
VITE_API_BASE_URL=http://localhost:8000
VITE_ENABLE_REGISTRATION=true
```

### Production Template (`.env.production`)
```bash
# Production Configuration
NODE_ENV=production
DEBUG=false
LOG_LEVEL=INFO

# Database (Use PostgreSQL in production)
DATABASE_URL=postgresql://user:password@host:port/database

# Services
QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-production-qdrant-api-key

# External APIs
GEMINI_API_KEY=your-production-gemini-api-key

# Security
JWT_SECRET=production-jwt-secret-32-chars-minimum

# CORS (Restrict to your domain)
CORS_ORIGINS=https://your-production-domain.com

# Frontend
VITE_API_BASE_URL=https://your-production-api-domain.com
VITE_ENABLE_REGISTRATION=false  # Disable registration in production
```

### Testing Template (`.env.test`)
```bash
# Test Configuration
NODE_ENV=test
DEBUG=false
LOG_LEVEL=WARNING

# Database (In-memory for tests)
DATABASE_URL=sqlite+aiosqlite:///:memory:

# Services (Mock or local)
QDRANT_HOST=localhost
QDRANT_PORT=6333

# External APIs (Use test keys or mocks)
GEMINI_API_KEY=test-gemini-api-key

# Security
JWT_SECRET=test-jwt-secret-32-chars-minimum

# CORS
CORS_ORIGINS=http://localhost:3000

# Frontend
VITE_API_BASE_URL=http://localhost:8000
VITE_ENABLE_REGISTRATION=true
```

## Validation and Testing

### Environment Validation Script

Create `scripts/validate-environment.sh`:
```bash
#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validation functions
validate_required_var() {
    local var_name=$1
    local var_value=${!var_name}
    
    if [[ -z "$var_value" ]]; then
        echo -e "${RED}❌ $var_name is not set${NC}"
        return 1
    else
        echo -e "${GREEN}✅ $var_name is set${NC}"
        return 0
    fi
}

validate_jwt_secret() {
    if [[ ${#JWT_SECRET} -lt 32 ]]; then
        echo -e "${RED}❌ JWT_SECRET must be at least 32 characters (current: ${#JWT_SECRET})${NC}"
        return 1
    else
        echo -e "${GREEN}✅ JWT_SECRET length is valid (${#JWT_SECRET} characters)${NC}"
        return 0
    fi
}

validate_database_url() {
    if [[ "$DATABASE_URL" =~ ^(sqlite|postgresql):// ]]; then
        echo -e "${GREEN}✅ DATABASE_URL format is valid${NC}"
        return 0
    else
        echo -e "${RED}❌ DATABASE_URL format is invalid${NC}"
        return 1
    fi
}

validate_cors_origins() {
    if [[ "$CORS_ORIGINS" =~ ^https?:// ]]; then
        echo -e "${GREEN}✅ CORS_ORIGINS format is valid${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  CORS_ORIGINS should start with http:// or https://${NC}"
        return 0
    fi
}

# Main validation
echo "🔍 Validating environment variables..."
echo

# Required variables
required_vars=(
    "JWT_SECRET"
    "DATABASE_URL"
    "GEMINI_API_KEY"
)

validation_failed=false

for var in "${required_vars[@]}"; do
    if ! validate_required_var "$var"; then
        validation_failed=true
    fi
done

# Specific validations
if [[ -n "$JWT_SECRET" ]]; then
    if ! validate_jwt_secret; then
        validation_failed=true
    fi
fi

if [[ -n "$DATABASE_URL" ]]; then
    validate_database_url
fi

if [[ -n "$CORS_ORIGINS" ]]; then
    validate_cors_origins
fi

# Optional variables check
optional_vars=(
    "QDRANT_HOST"
    "QDRANT_PORT"
    "QDRANT_CLOUD_URL"
    "QDRANT_API_KEY"
    "USER_REGISTRATION_ENABLED"
    "CORS_ORIGINS"
)

echo
echo "📋 Optional variables status:"
for var in "${optional_vars[@]}"; do
    if [[ -n "${!var}" ]]; then
        echo -e "${GREEN}✅ $var is set${NC}"
    else
        echo -e "${YELLOW}⚠️  $var is not set${NC}"
    fi
done

echo
if [[ "$validation_failed" == true ]]; then
    echo -e "${RED}❌ Environment validation failed${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Environment validation passed${NC}"
    exit 0
fi
```

### Testing Environment Variables

Create `scripts/test-environment.sh`:
```bash
#!/bin/bash

# Test database connection
test_database() {
    echo "Testing database connection..."
    python -c "
import asyncio
from src.core.database import get_database
async def test():
    try:
        db = get_database()
        print('✅ Database connection successful')
        return True
    except Exception as e:
        print(f'❌ Database connection failed: {e}')
        return False
asyncio.run(test())
"
}

# Test Qdrant connection
test_qdrant() {
    echo "Testing Qdrant connection..."
    if [[ -n "$QDRANT_CLOUD_URL" ]]; then
        curl -f -s "$QDRANT_CLOUD_URL/health" > /dev/null
    else
        curl -f -s "http://${QDRANT_HOST:-localhost}:${QDRANT_PORT:-6333}/health" > /dev/null
    fi
    
    if [[ $? -eq 0 ]]; then
        echo "✅ Qdrant connection successful"
    else
        echo "❌ Qdrant connection failed"
    fi
}

# Test Gemini API
test_gemini() {
    echo "Testing Gemini API..."
    python -c "
import os
import requests
api_key = os.getenv('GEMINI_API_KEY')
if not api_key:
    print('❌ GEMINI_API_KEY not set')
    exit(1)

try:
    # Simple API test
    url = f'https://generativelanguage.googleapis.com/v1/models?key={api_key}'
    response = requests.get(url, timeout=10)
    if response.status_code == 200:
        print('✅ Gemini API connection successful')
    else:
        print(f'❌ Gemini API connection failed: {response.status_code}')
except Exception as e:
    print(f'❌ Gemini API connection failed: {e}')
"
}

# Run all tests
echo "🧪 Testing environment configuration..."
echo

test_database
test_qdrant
test_gemini

echo
echo "✅ Environment testing complete"
```

## Security Best Practices

### Secret Management Best Practices

1. **Never commit secrets to version control**
   ```bash
   # Add to .gitignore
   echo ".env*" >> .gitignore
   echo "!.env.example" >> .gitignore
   ```

2. **Use different secrets for different environments**
   ```bash
   # Development
   JWT_SECRET=dev-secret-32-chars-minimum
   
   # Production
   JWT_SECRET=prod-secret-different-32-chars-minimum
   ```

3. **Rotate secrets regularly**
   ```bash
   # Generate new JWT secret
   NEW_SECRET=$(openssl rand -base64 32)
   
   # Update in platform
   railway variables set JWT_SECRET="$NEW_SECRET"
   ```

4. **Use platform-specific secret management**
   - Railway: Environment variables (encrypted)
   - Fly.io: Secrets (encrypted at rest)
   - Google Cloud: Secret Manager
   - Vercel: Environment variables (encrypted)

### Environment Variable Security

1. **Validate environment variables on startup**
   ```python
   import os
   import sys
   
   def validate_environment():
       required_vars = ['JWT_SECRET', 'DATABASE_URL', 'GEMINI_API_KEY']
       missing_vars = [var for var in required_vars if not os.getenv(var)]
       
       if missing_vars:
           print(f"Missing required environment variables: {missing_vars}")
           sys.exit(1)
   
   validate_environment()
   ```

2. **Use secure defaults**
   ```python
   # Secure defaults
   USER_REGISTRATION_ENABLED = os.getenv('USER_REGISTRATION_ENABLED', 'false').lower() == 'true'
   DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'
   LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
   ```

3. **Sanitize environment variables in logs**
   ```python
   import re
   
   def sanitize_env_for_logging(env_dict):
       sensitive_patterns = [
           r'.*SECRET.*',
           r'.*PASSWORD.*',
           r'.*KEY.*',
           r'.*TOKEN.*'
       ]
       
       sanitized = {}
       for key, value in env_dict.items():
           if any(re.match(pattern, key, re.IGNORECASE) for pattern in sensitive_patterns):
               sanitized[key] = '***'
           else:
               sanitized[key] = value
       
       return sanitized
   ```

## Troubleshooting

### Common Issues

#### 1. JWT Secret Too Short
```bash
# Error: JWT secret must be at least 32 characters
# Solution: Generate proper secret
openssl rand -base64 32
```

#### 2. Database Connection Failed
```bash
# Check DATABASE_URL format
echo $DATABASE_URL

# For SQLite, ensure directory exists
mkdir -p data/

# For PostgreSQL, test connection
psql "$DATABASE_URL" -c "SELECT 1;"
```

#### 3. CORS Issues
```bash
# Check CORS_ORIGINS format
echo $CORS_ORIGINS

# Should be: https://domain.com,https://other-domain.com
# Not: https://domain.com, https://other-domain.com (no spaces)
```

#### 4. API Key Invalid
```bash
# Test Gemini API key
curl -H "Authorization: Bearer $GEMINI_API_KEY" \
  "https://generativelanguage.googleapis.com/v1/models"
```

### Environment Variable Debugging

Create `scripts/debug-environment.sh`:
```bash
#!/bin/bash

echo "🔍 Environment Variable Debug Information"
echo "========================================"
echo

echo "📊 System Information:"
echo "OS: $(uname -s)"
echo "Shell: $SHELL"
echo "User: $USER"
echo "PWD: $PWD"
echo

echo "🔐 Security Variables (sanitized):"
echo "JWT_SECRET: ${JWT_SECRET:0:8}... (${#JWT_SECRET} chars)"
echo "GEMINI_API_KEY: ${GEMINI_API_KEY:0:8}... (${#GEMINI_API_KEY} chars)"
echo

echo "🗄️ Database Configuration:"
echo "DATABASE_URL: ${DATABASE_URL}"
echo

echo "🔍 Vector Database Configuration:"
echo "QDRANT_HOST: ${QDRANT_HOST:-not set}"
echo "QDRANT_PORT: ${QDRANT_PORT:-not set}"
echo "QDRANT_CLOUD_URL: ${QDRANT_CLOUD_URL:-not set}"
echo "QDRANT_API_KEY: ${QDRANT_API_KEY:0:8}... (${#QDRANT_API_KEY} chars)"
echo

echo "🌐 CORS Configuration:"
echo "CORS_ORIGINS: ${CORS_ORIGINS:-not set}"
echo

echo "⚙️ Application Configuration:"
echo "USER_REGISTRATION_ENABLED: ${USER_REGISTRATION_ENABLED:-not set}"
echo "LOG_LEVEL: ${LOG_LEVEL:-not set}"
echo "DEBUG: ${DEBUG:-not set}"
echo

echo "🎨 Frontend Configuration:"
echo "VITE_API_BASE_URL: ${VITE_API_BASE_URL:-not set}"
echo "VITE_ENABLE_REGISTRATION: ${VITE_ENABLE_REGISTRATION:-not set}"
```

### Platform-Specific Debugging

#### Railway
```bash
# Check current variables
railway variables

# Check service logs
railway logs

# Check service status
railway status
```

#### Fly.io
```bash
# Check secrets
flyctl secrets list

# Check environment variables
flyctl config show

# Check app status
flyctl status
```

#### Google Cloud Run
```bash
# Check service configuration
gcloud run services describe SERVICE_NAME --region=REGION

# Check secrets
gcloud secrets list

# Check logs
gcloud logging read "resource.type=\"cloud_run_revision\""
```

#### Vercel
```bash
# Check environment variables
vercel env ls

# Check deployment logs
vercel logs

# Check project settings
vercel project ls
```

This comprehensive guide should help you properly configure and manage environment variables and secrets across all deployment platforms.