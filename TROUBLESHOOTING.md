# Troubleshooting and Maintenance Guide

This comprehensive guide covers common deployment issues, solutions, and maintenance procedures for the Knowledge Assistant RAG application across all supported platforms.

## Table of Contents

1. [Common Deployment Issues](#common-deployment-issues)
2. [Platform-Specific Issues](#platform-specific-issues)
3. [Environment Variables and Secrets](#environment-variables-and-secrets)
4. [Performance Optimization](#performance-optimization)
5. [Database Issues](#database-issues)
6. [Service Communication Problems](#service-communication-problems)
7. [Monitoring and Logging](#monitoring-and-logging)
8. [Maintenance Procedures](#maintenance-procedures)
9. [Emergency Recovery](#emergency-recovery)

## Common Deployment Issues

### 1. Container Build Failures

#### Symptoms
- Build process fails during Docker image creation
- "No space left on device" errors
- Dependency installation failures

#### Solutions

**Memory/Disk Space Issues:**
```bash
# Clean up Docker system
docker system prune -a

# Remove unused images
docker image prune -a

# Check disk space
df -h
```

**Dependency Issues:**
```bash
# Clear package manager cache
npm cache clean --force
pip cache purge

# Update package lists
apt-get update  # For Debian/Ubuntu
apk update      # For Alpine
```

**Multi-stage Build Optimization:**
```dockerfile
# Use .dockerignore to exclude unnecessary files
echo "node_modules" >> .dockerignore
echo ".git" >> .dockerignore
echo "*.md" >> .dockerignore
echo "tests/" >> .dockerignore
```

### 2. Memory Limit Exceeded

#### Symptoms
- Services crash with OOM (Out of Memory) errors
- Slow performance or timeouts
- Platform-specific memory limit warnings

#### Solutions

**Immediate Fixes:**
```bash
# Check memory usage
docker stats
htop
free -h

# Restart services to clear memory
docker-compose restart
```

**Long-term Optimization:**
```bash
# Use Alpine Linux base images
FROM python:3.11-alpine instead of python:3.11

# Remove development dependencies
pip install --no-dev
npm ci --only=production

# Use external services
# Replace Ollama with Google Gemini API
# Use Qdrant Cloud instead of self-hosted
```

### 3. Service Startup Failures

#### Symptoms
- Services fail to start or immediately crash
- Health checks fail
- Connection refused errors

#### Diagnostic Steps
```bash
# Check service logs
docker-compose logs service-name
kubectl logs pod-name  # For Kubernetes
flyctl logs           # For Fly.io

# Check service status
docker-compose ps
systemctl status service-name

# Test service connectivity
curl -f http://localhost:8000/health
telnet localhost 6333  # For Qdrant
```

#### Common Solutions
```bash
# Check environment variables
env | grep -E "(DATABASE|QDRANT|JWT)"

# Verify file permissions
chmod +x scripts/*.sh
chown -R app:app /app/data

# Check port conflicts
netstat -tulpn | grep :8000
lsof -i :8000
```

## Platform-Specific Issues

### Railway Deployment Issues

#### Issue: Service Won't Start
```bash
# Check Railway logs
railway logs

# Common fixes:
railway variables set PORT=8000
railway variables set DATABASE_URL=sqlite+aiosqlite:///./data/knowledge_assistant.db

# Restart service
railway service restart
```

#### Issue: Memory Limit (512MB) Exceeded
```bash
# Monitor memory usage
railway metrics

# Solutions:
# 1. Use external services
railway variables set QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
railway variables set GEMINI_API_KEY=your-api-key

# 2. Optimize container
# Use multi-stage builds and Alpine images
```

### Fly.io Deployment Issues

#### Issue: Volume Mount Problems
```bash
# Check volumes
flyctl volumes list

# Create missing volume
flyctl volumes create knowledge_data --size 1

# Verify mount in fly.toml
[mounts]
  source = "knowledge_data"
  destination = "/app/data"
```

#### Issue: Machine Won't Start
```bash
# Check machine status
flyctl machine list

# View detailed logs
flyctl logs --app your-app-name

# Restart machine
flyctl machine restart MACHINE_ID
```

### Google Cloud Run Issues

#### Issue: Cold Start Timeouts
```bash
# Check service configuration
gcloud run services describe SERVICE_NAME --region=us-central1

# Increase timeout and memory
gcloud run services update SERVICE_NAME \
  --region=us-central1 \
  --timeout=300 \
  --memory=1Gi \
  --cpu=1000m
```

#### Issue: Cloud SQL Connection Problems
```bash
# Test Cloud SQL connection
gcloud sql connect INSTANCE_NAME --user=USERNAME

# Check service account permissions
gcloud projects get-iam-policy PROJECT_ID

# Update connection string
gcloud run services update SERVICE_NAME \
  --region=us-central1 \
  --set-env-vars="DATABASE_URL=postgresql://user:pass@/db?host=/cloudsql/project:region:instance"
```

### Vercel Deployment Issues

#### Issue: Serverless Function Timeouts
```bash
# Check function logs in Vercel dashboard
# Or use Vercel CLI
vercel logs

# Optimize function performance:
# 1. Reduce cold start time
# 2. Use edge functions for simple operations
# 3. Implement proper caching
```

#### Issue: Build Size Limits
```bash
# Check build output size
du -sh .vercel/output

# Optimize bundle size:
npm run build -- --analyze
# Remove unused dependencies
npm prune --production
```

## Environment Variables and Secrets

### Required Environment Variables

#### Core Application Variables
```bash
# Authentication
JWT_SECRET=your-32-character-minimum-secret-key
USER_REGISTRATION_ENABLED=true

# Database
DATABASE_URL=sqlite+aiosqlite:///./data/knowledge_assistant.db
# Or for PostgreSQL:
DATABASE_URL=postgresql://user:password@host:port/database

# Vector Database
QDRANT_HOST=localhost
QDRANT_PORT=6333
# Or for Qdrant Cloud:
QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key

# LLM Service
GEMINI_API_KEY=your-google-gemini-api-key

# CORS Configuration
CORS_ORIGINS=https://your-frontend-domain.com,http://localhost:3000

# Frontend Configuration
VITE_API_BASE_URL=https://your-backend-domain.com
VITE_ENABLE_REGISTRATION=true
VITE_API_TIMEOUT=30000
```

### Secrets Management by Platform

#### Railway
```bash
# Set secrets via CLI
railway variables set JWT_SECRET=your-secret
railway variables set GEMINI_API_KEY=your-key

# Or via web dashboard
# Visit railway.app -> Your Project -> Variables
```

#### Fly.io
```bash
# Set secrets via CLI
flyctl secrets set JWT_SECRET=your-secret
flyctl secrets set GEMINI_API_KEY=your-key

# List current secrets
flyctl secrets list
```

#### Google Cloud Run
```bash
# Create secrets in Secret Manager
gcloud secrets create jwt-secret --data-file=jwt-secret.txt
gcloud secrets create gemini-api-key --data-file=gemini-key.txt

# Grant access to service account
gcloud secrets add-iam-policy-binding jwt-secret \
  --member="serviceAccount:SERVICE_ACCOUNT@PROJECT.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### Vercel
```bash
# Set environment variables via CLI
vercel env add JWT_SECRET
vercel env add GEMINI_API_KEY

# Or via web dashboard
# Visit vercel.com -> Your Project -> Settings -> Environment Variables
```

### Environment Variable Validation

Create a validation script:
```bash
#!/bin/bash
# validate-env.sh

required_vars=(
  "JWT_SECRET"
  "GEMINI_API_KEY"
  "DATABASE_URL"
)

for var in "${required_vars[@]}"; do
  if [[ -z "${!var}" ]]; then
    echo "ERROR: $var is not set"
    exit 1
  fi
done

# Validate JWT secret length
if [[ ${#JWT_SECRET} -lt 32 ]]; then
  echo "ERROR: JWT_SECRET must be at least 32 characters"
  exit 1
fi

echo "All environment variables are valid"
```

## Performance Optimization

### Container Optimization

#### Multi-stage Dockerfile Example
```dockerfile
# Build stage
FROM node:18-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Image Size Optimization
```bash
# Before optimization
docker images | grep knowledge-assistant
# knowledge-assistant-backend   latest   7.84GB

# After optimization techniques:
# 1. Multi-stage builds
# 2. Alpine base images
# 3. Dependency pruning
# 4. Layer optimization

# After optimization
docker images | grep knowledge-assistant
# knowledge-assistant-backend   latest   156MB
```

### Database Performance

#### SQLite Optimization
```python
# In your database configuration
DATABASE_CONFIG = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
    "connect_args": {
        "check_same_thread": False,
        "timeout": 20,
        "isolation_level": None,
    }
}
```

#### PostgreSQL Optimization
```python
# Connection pooling
DATABASE_CONFIG = {
    "pool_size": 5,
    "max_overflow": 10,
    "pool_pre_ping": True,
    "pool_recycle": 3600,
}
```

### API Performance

#### Caching Implementation
```python
from functools import lru_cache
import redis

# In-memory caching
@lru_cache(maxsize=128)
def get_cached_embeddings(text_hash):
    return generate_embeddings(text)

# Redis caching (if available)
redis_client = redis.Redis(host='localhost', port=6379, db=0)

def cache_query_result(query_hash, result):
    redis_client.setex(query_hash, 3600, json.dumps(result))
```

### Scaling Guidelines

#### Horizontal Scaling
```yaml
# For Kubernetes
apiVersion: apps/v1
kind: Deployment
metadata:
  name: knowledge-assistant-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: knowledge-assistant-backend
  template:
    spec:
      containers:
      - name: backend
        image: knowledge-assistant-backend:latest
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

#### Vertical Scaling
```bash
# Railway
railway service scale --memory 1024

# Fly.io
flyctl scale memory 512

# Google Cloud Run
gcloud run services update SERVICE_NAME \
  --memory=1Gi \
  --cpu=1000m
```

## Database Issues

### SQLite Issues

#### Database Locked Errors
```bash
# Check for zombie processes
ps aux | grep python
kill -9 PID

# Check file permissions
ls -la data/knowledge_assistant.db
chmod 664 data/knowledge_assistant.db

# Backup and restore database
sqlite3 data/knowledge_assistant.db ".backup backup.db"
mv backup.db data/knowledge_assistant.db
```

#### Corruption Recovery
```bash
# Check database integrity
sqlite3 data/knowledge_assistant.db "PRAGMA integrity_check;"

# Repair database
sqlite3 data/knowledge_assistant.db ".recover" | sqlite3 repaired.db
mv repaired.db data/knowledge_assistant.db
```

### PostgreSQL Issues

#### Connection Pool Exhaustion
```python
# Monitor connection pool
from sqlalchemy import event
from sqlalchemy.pool import Pool

@event.listens_for(Pool, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    print(f"New connection: {dbapi_connection}")

@event.listens_for(Pool, "checkout")
def receive_checkout(dbapi_connection, connection_record, connection_proxy):
    print(f"Connection checked out: {dbapi_connection}")
```

#### Migration Issues
```bash
# Check migration status
alembic current
alembic history

# Reset migrations (DANGEROUS - backup first!)
alembic stamp head
alembic revision --autogenerate -m "Reset migrations"
alembic upgrade head
```

## Service Communication Problems

### Internal Service Discovery

#### Docker Compose
```yaml
# Ensure services can communicate
version: '3.8'
services:
  backend:
    environment:
      - QDRANT_HOST=qdrant
      - QDRANT_PORT=6333
  qdrant:
    hostname: qdrant
```

#### Kubernetes
```yaml
# Service definition
apiVersion: v1
kind: Service
metadata:
  name: qdrant-service
spec:
  selector:
    app: qdrant
  ports:
  - port: 6333
    targetPort: 6333
```

### Network Debugging

#### Test Service Connectivity
```bash
# From within container
curl -f http://qdrant:6333/health
telnet qdrant 6333
nslookup qdrant

# Check DNS resolution
dig qdrant.default.svc.cluster.local  # Kubernetes
nslookup qdrant-service.railway.internal  # Railway
```

#### Port Conflicts
```bash
# Check port usage
netstat -tulpn | grep :6333
lsof -i :6333

# Kill conflicting processes
sudo kill -9 $(lsof -t -i:6333)
```

## Monitoring and Logging

### Health Check Implementation

#### Backend Health Endpoint
```python
from fastapi import FastAPI, HTTPException
import asyncio

app = FastAPI()

@app.get("/health")
async def health_check():
    checks = {
        "database": await check_database(),
        "qdrant": await check_qdrant(),
        "gemini": await check_gemini_api(),
    }
    
    if all(checks.values()):
        return {"status": "healthy", "checks": checks}
    else:
        raise HTTPException(status_code=503, detail={"status": "unhealthy", "checks": checks})

async def check_database():
    try:
        # Test database connection
        return True
    except Exception:
        return False
```

#### Monitoring Script
```bash
#!/bin/bash
# monitor-services.sh

services=("frontend:3000" "backend:8000" "qdrant:6333")

for service in "${services[@]}"; do
    name=${service%:*}
    port=${service#*:}
    
    if curl -f -s "http://localhost:$port/health" > /dev/null; then
        echo "✅ $name is healthy"
    else
        echo "❌ $name is unhealthy"
        # Send alert or restart service
    fi
done
```

### Log Aggregation

#### Centralized Logging
```bash
# Docker Compose with logging
version: '3.8'
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

#### Log Analysis
```bash
# Search for errors
grep -i error logs/*.log
grep -E "(500|error|exception)" logs/backend.log

# Monitor real-time logs
tail -f logs/backend.log | grep -i error
```

## Maintenance Procedures

### Regular Maintenance Tasks

#### Daily Tasks
```bash
#!/bin/bash
# daily-maintenance.sh

# Check service health
./scripts/health-check.sh

# Backup database
./scripts/backup-database.sh

# Clean up logs
find logs/ -name "*.log" -mtime +7 -delete

# Check disk space
df -h | awk '$5 > 80 {print "WARNING: " $0}'
```

#### Weekly Tasks
```bash
#!/bin/bash
# weekly-maintenance.sh

# Update dependencies (in development)
npm audit fix
pip list --outdated

# Clean up Docker
docker system prune -f

# Rotate logs
logrotate /etc/logrotate.d/knowledge-assistant
```

#### Monthly Tasks
```bash
#!/bin/bash
# monthly-maintenance.sh

# Security updates
apt update && apt upgrade -y  # Ubuntu/Debian
apk update && apk upgrade     # Alpine

# Performance analysis
./scripts/performance-report.sh

# Backup verification
./scripts/verify-backups.sh
```

### Database Maintenance

#### SQLite Maintenance
```bash
# Vacuum database to reclaim space
sqlite3 data/knowledge_assistant.db "VACUUM;"

# Analyze query performance
sqlite3 data/knowledge_assistant.db "ANALYZE;"

# Check database size
du -sh data/knowledge_assistant.db
```

#### PostgreSQL Maintenance
```sql
-- Vacuum and analyze
VACUUM ANALYZE;

-- Check database size
SELECT pg_size_pretty(pg_database_size('knowledge_assistant'));

-- Check table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Emergency Recovery

### Service Recovery Procedures

#### Complete Service Failure
```bash
# 1. Check system resources
free -h
df -h
ps aux | head -20

# 2. Restart all services
docker-compose down
docker-compose up -d

# 3. Check logs for errors
docker-compose logs --tail=100

# 4. Verify health
curl -f http://localhost:8000/health
```

#### Database Recovery
```bash
# 1. Stop application
docker-compose stop backend

# 2. Backup current database
cp data/knowledge_assistant.db data/knowledge_assistant.db.backup

# 3. Restore from backup
cp backups/latest-backup.db data/knowledge_assistant.db

# 4. Start application
docker-compose start backend

# 5. Verify functionality
curl -f http://localhost:8000/health
```

### Rollback Procedures

#### Docker Deployment Rollback
```bash
# List previous images
docker images | grep knowledge-assistant

# Rollback to previous version
docker-compose down
docker tag knowledge-assistant-backend:latest knowledge-assistant-backend:rollback
docker tag knowledge-assistant-backend:previous knowledge-assistant-backend:latest
docker-compose up -d
```

#### Platform-Specific Rollbacks

**Railway:**
```bash
railway rollback
```

**Fly.io:**
```bash
flyctl releases rollback
```

**Google Cloud Run:**
```bash
gcloud run services update SERVICE_NAME \
  --image=gcr.io/PROJECT/IMAGE:PREVIOUS_TAG
```

**Vercel:**
```bash
vercel rollback
```

### Data Recovery

#### Vector Database Recovery
```bash
# Backup Qdrant data
tar -czf qdrant-backup-$(date +%Y%m%d).tar.gz data/qdrant/

# Restore Qdrant data
tar -xzf qdrant-backup-YYYYMMDD.tar.gz -C data/
```

#### User Data Recovery
```bash
# Export user data
sqlite3 data/knowledge_assistant.db ".mode csv" ".output users.csv" "SELECT * FROM users;"

# Import user data
sqlite3 data/knowledge_assistant.db ".mode csv" ".import users.csv users"
```

## Getting Help

### Support Channels

1. **Documentation**: Check platform-specific documentation first
2. **Community Forums**: 
   - Railway: [Discord](https://discord.gg/railway)
   - Fly.io: [Community Forum](https://community.fly.io/)
   - Google Cloud: [Stack Overflow](https://stackoverflow.com/questions/tagged/google-cloud-run)
   - Vercel: [Discord](https://discord.gg/vercel)

3. **Issue Reporting**: Create detailed bug reports with:
   - Platform and version information
   - Error messages and logs
   - Steps to reproduce
   - Environment configuration (without secrets)

### Diagnostic Information Collection

```bash
#!/bin/bash
# collect-diagnostics.sh

echo "=== System Information ==="
uname -a
docker --version
docker-compose --version

echo "=== Service Status ==="
docker-compose ps

echo "=== Resource Usage ==="
free -h
df -h

echo "=== Recent Logs ==="
docker-compose logs --tail=50

echo "=== Environment Variables ==="
env | grep -E "(DATABASE|QDRANT|JWT)" | sed 's/=.*/=***/'
```

This troubleshooting guide should help you diagnose and resolve most common issues with the Knowledge Assistant RAG application deployment.