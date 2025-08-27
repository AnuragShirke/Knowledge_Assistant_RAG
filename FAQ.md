# Frequently Asked Questions (FAQ)

This document addresses common questions about deploying, configuring, and maintaining the Knowledge Assistant RAG application across different platforms.

## Table of Contents

1. [General Questions](#general-questions)
2. [Deployment Questions](#deployment-questions)
3. [Configuration Questions](#configuration-questions)
4. [Performance Questions](#performance-questions)
5. [Troubleshooting Questions](#troubleshooting-questions)
6. [Security Questions](#security-questions)
7. [Cost and Scaling Questions](#cost-and-scaling-questions)

## General Questions

### Q: What is the Knowledge Assistant RAG application?

**A:** The Knowledge Assistant RAG (Retrieval-Augmented Generation) application is a document-based question-answering system that allows users to upload documents, process them into vector embeddings, and query them using natural language. It combines document retrieval with large language model generation to provide accurate, context-aware responses.

**Key Features:**
- Document upload and processing (PDF, TXT, DOCX, MD)
- Vector-based semantic search using Qdrant
- AI-powered responses using Google Gemini API
- User authentication and document management
- RESTful API with React frontend

### Q: What are the system requirements?

**A:** 
**Minimum Requirements:**
- 512MB RAM (with external services)
- 1GB storage
- 1 CPU core
- Internet connection for API services

**Recommended Requirements:**
- 1GB RAM
- 5GB storage
- 2 CPU cores
- Stable internet connection

**Development Requirements:**
- Docker and Docker Compose
- Node.js 18+ (for frontend development)
- Python 3.11+ (for backend development)

### Q: Which deployment platforms are supported?

**A:** The application supports multiple deployment platforms:

1. **Railway** - Free tier: 512MB RAM, 1GB storage
2. **Fly.io** - Free tier: 256MB RAM, 1GB storage
3. **Google Cloud Run** - Free tier: 1GB memory, 2 vCPU
4. **Vercel** - Hybrid deployment with serverless functions
5. **Local Docker** - For development and self-hosting

Each platform has specific optimizations and configurations documented in their respective deployment guides.

### Q: What external services are required?

**A:** 
**Required:**
- Google Gemini API (for LLM responses)

**Optional (but recommended for production):**
- Qdrant Cloud (vector database)
- PostgreSQL (database, instead of SQLite)
- Redis (caching)

**Free Tier Alternatives:**
- Use SQLite for database (included)
- Self-host Qdrant (included in Docker setup)
- Use in-memory caching instead of Redis

## Deployment Questions

### Q: How do I choose the best deployment platform?

**A:** Choose based on your needs:

**Railway** - Best for beginners
- ✅ Easy setup and deployment
- ✅ Built-in PostgreSQL
- ✅ Good free tier (512MB RAM)
- ❌ Limited to single region

**Fly.io** - Best for global deployment
- ✅ Multi-region deployment
- ✅ Excellent Docker support
- ✅ Good performance
- ❌ Smaller free tier (256MB RAM)

**Google Cloud Run** - Best for enterprise
- ✅ Largest free tier (1GB RAM)
- ✅ Excellent scaling
- ✅ Integration with Google services
- ❌ More complex setup

**Vercel** - Best for frontend-heavy applications
- ✅ Excellent frontend performance
- ✅ Global CDN
- ✅ Serverless functions
- ❌ Backend limitations

### Q: Can I deploy without using external APIs?

**A:** Partially. You can run the application locally with self-hosted services, but you'll need at least one of these for LLM functionality:

**Options:**
1. **Google Gemini API** (recommended, free tier available)
2. **OpenAI API** (paid service)
3. **Self-hosted Ollama** (requires significant resources, 2GB+ RAM)

**Note:** The free deployment guides focus on using external APIs to stay within platform resource limits.

### Q: How long does deployment take?

**A:** Deployment times vary by platform:

- **Railway**: 5-10 minutes (automated)
- **Fly.io**: 10-15 minutes (includes volume creation)
- **Google Cloud Run**: 15-20 minutes (includes infrastructure setup)
- **Vercel**: 5-10 minutes (frontend-focused)
- **Local Docker**: 2-5 minutes (after initial image builds)

**First-time setup** may take longer due to:
- API key generation
- Platform account setup
- Initial image builds

### Q: What happens if deployment fails?

**A:** Common failure points and solutions:

1. **Build Failures**
   - Check Docker image compatibility
   - Verify all dependencies are available
   - Review build logs for specific errors

2. **Resource Limits**
   - Use external services (Qdrant Cloud, Gemini API)
   - Optimize Docker images
   - Consider upgrading to paid tier

3. **Configuration Errors**
   - Validate environment variables
   - Check API key permissions
   - Verify service connectivity

**Recovery Steps:**
```bash
# Check deployment logs
railway logs  # or flyctl logs, gcloud logs, etc.

# Rollback to previous version
railway rollback  # or flyctl releases rollback

# Redeploy with fixes
./deploy.sh platform-name
```

## Configuration Questions

### Q: How do I generate a secure JWT secret?

**A:** Use one of these methods to generate a secure JWT secret (minimum 32 characters):

```bash
# Method 1: OpenSSL (recommended)
openssl rand -base64 32

# Method 2: Python
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Method 3: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Important:** 
- Use different secrets for development and production
- Never commit secrets to version control
- Rotate secrets periodically

### Q: How do I configure CORS for my domain?

**A:** Set the `CORS_ORIGINS` environment variable with your domain(s):

```bash
# Single domain
CORS_ORIGINS=https://your-domain.com

# Multiple domains (comma-separated, no spaces)
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Development (include localhost)
CORS_ORIGINS=https://your-domain.com,http://localhost:3000
```

**Platform-specific setup:**
```bash
# Railway
railway variables set CORS_ORIGINS="https://your-domain.com"

# Fly.io
flyctl secrets set CORS_ORIGINS="https://your-domain.com"

# Google Cloud Run
gcloud run services update SERVICE_NAME \
  --set-env-vars="CORS_ORIGINS=https://your-domain.com"
```

### Q: How do I switch from SQLite to PostgreSQL?

**A:** 

1. **Update DATABASE_URL:**
```bash
# From SQLite
DATABASE_URL=sqlite+aiosqlite:///./data/knowledge_assistant.db

# To PostgreSQL
DATABASE_URL=postgresql://username:password@host:port/database
```

2. **Platform-specific PostgreSQL:**
```bash
# Railway (automatic)
railway add postgresql
# DATABASE_URL is automatically set

# Google Cloud Run
# Use Cloud SQL instance connection string

# Fly.io
flyctl postgres create --name myapp-db
flyctl postgres attach myapp-db
```

3. **Run migrations:**
```bash
# Migrations will run automatically on startup
# Or manually:
alembic upgrade head
```

### Q: How do I use Qdrant Cloud instead of self-hosted?

**A:** 

1. **Sign up for Qdrant Cloud:**
   - Visit [cloud.qdrant.io](https://cloud.qdrant.io)
   - Create a cluster
   - Get your cluster URL and API key

2. **Update environment variables:**
```bash
# Remove self-hosted Qdrant variables
unset QDRANT_HOST
unset QDRANT_PORT

# Add Qdrant Cloud variables
QDRANT_CLOUD_URL=https://your-cluster-id.qdrant.io
QDRANT_API_KEY=your-api-key
```

3. **Update deployment:**
```bash
# Set in your platform
railway variables set QDRANT_CLOUD_URL="https://your-cluster.qdrant.io"
railway variables set QDRANT_API_KEY="your-api-key"
```

## Performance Questions

### Q: Why is my application slow?

**A:** Common performance issues and solutions:

1. **Slow API Responses**
   - Enable response caching
   - Use database connection pooling
   - Optimize database queries
   - Consider using Redis for caching

2. **Slow Document Processing**
   - Process documents in background tasks
   - Use batch processing for multiple documents
   - Optimize embedding generation

3. **Slow Vector Search**
   - Optimize Qdrant configuration
   - Use appropriate vector dimensions
   - Consider using quantization

4. **High Memory Usage**
   - Use external services (Qdrant Cloud, Gemini API)
   - Implement memory cleanup
   - Optimize Docker images

### Q: How can I optimize for the free tier limits?

**A:** 

**Memory Optimization:**
- Use external APIs instead of self-hosted services
- Implement memory cleanup routines
- Use Alpine Linux base images
- Enable auto-scaling to zero

**Storage Optimization:**
- Use external databases (Railway PostgreSQL, Cloud SQL)
- Implement log rotation
- Clean up temporary files

**CPU Optimization:**
- Use async processing
- Implement request queuing
- Cache expensive operations

**Example configuration for Railway free tier:**
```bash
# Use external services to minimize memory usage
QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
GEMINI_API_KEY=your-api-key
DATABASE_URL=$DATABASE_URL  # Railway PostgreSQL

# Optimize application settings
WORKERS=1
MAX_CONNECTIONS=50
LOG_LEVEL=WARNING
```

### Q: How do I monitor performance?

**A:** 

**Built-in Monitoring:**
```bash
# Health check endpoint
curl https://your-app.com/health

# Detailed health check
curl https://your-app.com/health/detailed
```

**Platform Monitoring:**
- **Railway**: Built-in metrics dashboard
- **Fly.io**: `flyctl metrics` command
- **Google Cloud Run**: Cloud Monitoring
- **Vercel**: Analytics dashboard

**Custom Monitoring:**
```bash
# Run performance checks
./scripts/health-check.sh

# Generate performance report
./scripts/performance-report.sh
```

## Troubleshooting Questions

### Q: My deployment is failing with "out of memory" errors. What should I do?

**A:** 

**Immediate Solutions:**
1. **Use external services:**
```bash
# Replace self-hosted Qdrant with Qdrant Cloud
QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-api-key

# Use Gemini API instead of Ollama
GEMINI_API_KEY=your-api-key
```

2. **Optimize Docker images:**
```bash
# Use multi-stage builds
# Use Alpine Linux base images
# Remove development dependencies
```

3. **Reduce resource usage:**
```bash
WORKERS=1
MAX_CONNECTIONS=25
LOG_LEVEL=WARNING
```

**Long-term Solutions:**
- Upgrade to paid tier
- Implement horizontal scaling
- Use serverless architecture

### Q: Services can't communicate with each other. How do I fix this?

**A:** 

**Check Service URLs:**
```bash
# Verify environment variables
echo $QDRANT_HOST
echo $VITE_API_BASE_URL

# Test connectivity
curl -f http://qdrant:6333/health
curl -f http://backend:8000/health
```

**Platform-specific fixes:**

**Docker Compose:**
```yaml
# Ensure services are on same network
services:
  backend:
    environment:
      - QDRANT_HOST=qdrant
  qdrant:
    hostname: qdrant
```

**Railway:**
```bash
# Use Railway internal URLs
QDRANT_HOST=qdrant.railway.internal
```

**Fly.io:**
```bash
# Use Fly.io internal DNS
QDRANT_HOST=qdrant-app.internal
```

### Q: I'm getting CORS errors. How do I fix them?

**A:** 

**Check CORS Configuration:**
```bash
# Verify CORS_ORIGINS is set correctly
echo $CORS_ORIGINS

# Should match your frontend URL exactly
CORS_ORIGINS=https://your-frontend-domain.com
```

**Common CORS Issues:**
1. **Missing protocol:** Use `https://` not just `domain.com`
2. **Extra spaces:** Use `domain1.com,domain2.com` not `domain1.com, domain2.com`
3. **Wrong port:** Include port if not standard (`:3000` for development)

**Test CORS:**
```bash
# Test CORS preflight
curl -X OPTIONS \
  -H "Origin: https://your-frontend.com" \
  -H "Access-Control-Request-Method: POST" \
  https://your-backend.com/api/query
```

### Q: Database migrations are failing. What should I do?

**A:** 

**Check Migration Status:**
```bash
# Check current migration version
alembic current

# Check migration history
alembic history

# Check for pending migrations
alembic show head
```

**Common Solutions:**
1. **Reset migrations (DANGEROUS - backup first!):**
```bash
# Backup database
cp data/knowledge_assistant.db data/backup.db

# Reset to head
alembic stamp head
```

2. **Manual migration:**
```bash
# Run specific migration
alembic upgrade +1

# Downgrade if needed
alembic downgrade -1
```

3. **Fresh database:**
```bash
# Remove database file
rm data/knowledge_assistant.db

# Restart application (migrations run automatically)
docker-compose restart backend
```

## Security Questions

### Q: How do I secure my deployment?

**A:** 

**Essential Security Measures:**

1. **Use HTTPS everywhere:**
   - All platforms provide HTTPS by default
   - Never use HTTP in production

2. **Secure JWT secrets:**
```bash
# Generate strong secrets (32+ characters)
JWT_SECRET=$(openssl rand -base64 32)

# Use different secrets for different environments
```

3. **Restrict CORS origins:**
```bash
# Don't use wildcards in production
CORS_ORIGINS=https://your-exact-domain.com

# Not this:
CORS_ORIGINS=*
```

4. **Use environment variables for secrets:**
```bash
# Never commit secrets to code
# Use platform secret management
railway variables set SECRET_NAME="secret_value"
```

5. **Enable user registration controls:**
```bash
# Disable registration in production if not needed
USER_REGISTRATION_ENABLED=false
```

### Q: How do I rotate API keys and secrets?

**A:** 

**JWT Secret Rotation:**
```bash
# Generate new secret
NEW_JWT_SECRET=$(openssl rand -base64 32)

# Update in platform
railway variables set JWT_SECRET="$NEW_JWT_SECRET"

# Restart application
railway service restart
```

**API Key Rotation:**
1. **Generate new API key** from provider
2. **Update environment variable** in platform
3. **Test functionality** with new key
4. **Revoke old key** from provider

**Database Password Rotation:**
1. **Create new database user** with new password
2. **Update DATABASE_URL** with new credentials
3. **Test connection**
4. **Remove old database user**

### Q: How do I backup my data?

**A:** 

**SQLite Backup:**
```bash
# Create backup
sqlite3 data/knowledge_assistant.db ".backup backup-$(date +%Y%m%d).db"

# Restore from backup
cp backup-20231201.db data/knowledge_assistant.db
```

**PostgreSQL Backup:**
```bash
# Create backup
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore from backup
psql $DATABASE_URL < backup-20231201.sql
```

**Qdrant Backup:**
```bash
# Create snapshot
curl -X POST "http://localhost:6333/collections/documents/snapshots"

# Download snapshot
curl "http://localhost:6333/collections/documents/snapshots/snapshot-name" > qdrant-backup.snapshot
```

**Automated Backup Script:**
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d)

# Backup database
sqlite3 data/knowledge_assistant.db ".backup backups/db-$DATE.db"

# Backup Qdrant data
tar -czf backups/qdrant-$DATE.tar.gz data/qdrant/

# Clean old backups (keep 7 days)
find backups/ -name "*.db" -mtime +7 -delete
find backups/ -name "*.tar.gz" -mtime +7 -delete
```

## Cost and Scaling Questions

### Q: How much does it cost to run this application?

**A:** 

**Free Tier Costs (Monthly):**
- **Railway**: $0 (512MB RAM, 1GB storage)
- **Fly.io**: $0 (256MB RAM, 1GB storage)
- **Google Cloud Run**: $0 (within free tier limits)
- **Vercel**: $0 (hobby plan)

**External Service Costs:**
- **Google Gemini API**: Free tier (60 requests/minute)
- **Qdrant Cloud**: Free tier (1GB storage)
- **Domain name**: $10-15/year (optional)

**Paid Tier Costs (if needed):**
- **Railway Pro**: $5/month (more resources)
- **Fly.io**: Pay-as-you-go (starts ~$2/month)
- **Google Cloud**: Pay-as-you-go (typically $5-20/month)

### Q: When should I upgrade from free tier?

**A:** 

**Upgrade indicators:**
- Consistently hitting memory limits
- Need for more than 1GB storage
- Require custom domains with SSL
- Need better performance/uptime SLAs
- Require more than 100 concurrent users

**Upgrade benefits:**
- More memory and CPU
- Better performance
- Priority support
- Advanced features (monitoring, backups)
- Higher rate limits

### Q: How do I scale the application for more users?

**A:** 

**Vertical Scaling (increase resources):**
```bash
# Railway
railway service scale --memory 1024

# Fly.io
flyctl scale memory 512

# Google Cloud Run
gcloud run services update SERVICE_NAME --memory=1Gi
```

**Horizontal Scaling (more instances):**
```bash
# Fly.io
flyctl scale count 3

# Google Cloud Run (automatic based on traffic)
gcloud run services update SERVICE_NAME \
  --max-instances=10 \
  --concurrency=80
```

**Database Scaling:**
- Use connection pooling
- Implement read replicas
- Consider managed database services

**Caching:**
- Add Redis for application caching
- Use CDN for static assets
- Implement API response caching

### Q: How do I monitor costs?

**A:** 

**Platform Monitoring:**
- **Railway**: Billing dashboard shows usage
- **Fly.io**: `flyctl billing` command
- **Google Cloud**: Cloud Billing console
- **Vercel**: Usage dashboard

**Cost Alerts:**
```bash
# Google Cloud billing alerts
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="Knowledge Assistant Budget" \
  --budget-amount=10USD

# Fly.io spending limits
flyctl orgs billing-limits set --limit=10
```

**Usage Monitoring Script:**
```bash
#!/bin/bash
# cost-monitor.sh

echo "📊 Resource Usage Report"
echo "======================="

# Check memory usage
echo "Memory: $(free -h | grep Mem | awk '{print $3"/"$2}')"

# Check disk usage
echo "Disk: $(df -h / | tail -1 | awk '{print $3"/"$2" ("$5")"}')"

# Check request count (from logs)
echo "Requests today: $(grep $(date +%Y-%m-%d) logs/access.log | wc -l)"

# Estimate costs based on usage
echo "Estimated monthly cost: $0 (free tier)"
```

This FAQ covers the most common questions about deploying and managing the Knowledge Assistant RAG application. For more specific issues, refer to the detailed troubleshooting guide or platform-specific documentation.