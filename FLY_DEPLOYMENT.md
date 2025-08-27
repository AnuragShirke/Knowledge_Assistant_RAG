# Fly.io Deployment Guide

This guide provides comprehensive instructions for deploying the Knowledge Assistant RAG application to Fly.io, a platform that offers generous free tier resources and excellent Docker support.

## Fly.io Resource Limits (Free Tier)

- **Memory**: 256MB RAM per app (shared across all machines)
- **Storage**: 1GB persistent storage per app
- **Bandwidth**: Unlimited
- **Machines**: Up to 3 shared-cpu-1x machines
- **Regions**: Deploy globally in multiple regions
- **Custom Domains**: Supported with automatic HTTPS

## Prerequisites

### Required Tools
- [Fly CLI (flyctl)](https://fly.io/docs/getting-started/installing-flyctl/)
- [Docker](https://docs.docker.com/get-docker/)
- [Git](https://git-scm.com/downloads)

### Fly.io Account Setup
1. Sign up at [fly.io](https://fly.io)
2. Install and authenticate Fly CLI:
   ```bash
   # Install flyctl
   curl -L https://fly.io/install.sh | sh
   
   # Add to PATH (add to your shell profile)
   export PATH="$HOME/.fly/bin:$PATH"
   
   # Authenticate
   flyctl auth login
   ```

### API Keys Required
- **Google Gemini API Key**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)

## Deployment Strategies

### Strategy 1: Single App Deployment (Recommended)

Deploy backend and frontend as a single Fly.io app with internal routing.

#### Step 1: Prepare Application

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd Knowledge_Assistant_RAG
   ```

2. Create Fly.io configuration:
   ```bash
   flyctl launch --no-deploy
   ```

3. This creates a `fly.toml` file. Replace it with our optimized configuration:
   ```toml
   app = "knowledge-assistant-rag"
   primary_region = "ord"
   
   [build]
     dockerfile = "Dockerfile.fly"
   
   [env]
     PORT = "8080"
     DATABASE_URL = "sqlite+aiosqlite:///./data/knowledge_assistant.db"
     QDRANT_HOST = "localhost"
     QDRANT_PORT = "6333"
     USER_REGISTRATION_ENABLED = "true"
   
   [http_service]
     internal_port = 8080
     force_https = true
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 0
     processes = ["app"]
   
   [[http_service.checks]]
     grace_period = "10s"
     interval = "30s"
     method = "GET"
     timeout = "5s"
     path = "/health"
   
   [mounts]
     source = "knowledge_data"
     destination = "/app/data"
   
   [[vm]]
     memory = "256mb"
     cpu_kind = "shared"
     cpus = 1
   ```

#### Step 2: Create Optimized Dockerfile

Create `Dockerfile.fly` for single-app deployment:
```dockerfile
# Multi-stage build for optimized production image
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend
COPY rag-quest-hub/package*.json ./
RUN npm ci --only=production

COPY rag-quest-hub/ ./
RUN npm run build

FROM python:3.11-alpine AS backend-builder

WORKDIR /app
RUN apk add --no-cache gcc musl-dev libffi-dev

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-alpine AS qdrant

RUN apk add --no-cache curl
RUN curl -L https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-unknown-linux-musl.tar.gz | tar xz
RUN mv qdrant /usr/local/bin/

FROM python:3.11-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache nginx supervisor curl

# Copy Python dependencies
COPY --from=backend-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin

# Copy Qdrant binary
COPY --from=qdrant /usr/local/bin/qdrant /usr/local/bin/

# Copy application code
WORKDIR /app
COPY src/ ./src/
COPY alembic/ ./alembic/
COPY alembic.ini ./

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./static/

# Create nginx configuration
RUN mkdir -p /etc/nginx/conf.d
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 8080;
    server_name _;
    
    # Serve static frontend files
    location / {
        root /app/static;
        try_files \$uri \$uri/ /index.html;
    }
    
    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Health check endpoint
    location /health {
        proxy_pass http://localhost:8000/health;
    }
}
EOF

# Create supervisor configuration
COPY <<EOF /etc/supervisor/conf.d/supervisord.conf
[supervisord]
nodaemon=true
user=root

[program:qdrant]
command=/usr/local/bin/qdrant --config-path /app/qdrant-config.yaml
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:backend]
command=python -m uvicorn src.main:app --host 0.0.0.0 --port 8000
directory=/app
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:nginx]
command=nginx -g "daemon off;"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF

# Create Qdrant configuration
COPY <<EOF /app/qdrant-config.yaml
service:
  http_port: 6333
  grpc_port: 6334
  host: 0.0.0.0

storage:
  storage_path: /app/data/qdrant

cluster:
  enabled: false
EOF

# Create data directory
RUN mkdir -p /app/data/qdrant

EXPOSE 8080

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

#### Step 3: Create Persistent Volume

```bash
# Create volume for data persistence
flyctl volumes create knowledge_data --region ord --size 1
```

#### Step 4: Set Secrets

```bash
# Set required secrets
flyctl secrets set JWT_SECRET=$(openssl rand -base64 32)
flyctl secrets set GEMINI_API_KEY=your-gemini-api-key-here

# Optional: Set CORS origins for production
flyctl secrets set CORS_ORIGINS=https://your-app.fly.dev
```

#### Step 5: Deploy

```bash
# Deploy the application
flyctl deploy

# Check deployment status
flyctl status

# View logs
flyctl logs
```

### Strategy 2: Multi-App Deployment

Deploy each service as separate Fly.io apps for better resource isolation.

⚠️ **Note**: This approach uses more resources and may exceed free tier limits.

#### Backend App

1. Create backend app:
   ```bash
   mkdir fly-backend && cd fly-backend
   flyctl launch --name knowledge-assistant-backend --no-deploy
   ```

2. Configure `fly.toml`:
   ```toml
   app = "knowledge-assistant-backend"
   primary_region = "ord"
   
   [build]
     dockerfile = "../Dockerfile"
   
   [env]
     DATABASE_URL = "sqlite+aiosqlite:///./data/knowledge_assistant.db"
     QDRANT_HOST = "knowledge-assistant-qdrant.internal"
     QDRANT_PORT = "6333"
   
   [http_service]
     internal_port = 8000
     force_https = true
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 0
   
   [mounts]
     source = "backend_data"
     destination = "/app/data"
   
   [[vm]]
     memory = "128mb"
     cpu_kind = "shared"
     cpus = 1
   ```

#### Qdrant App

1. Create Qdrant app:
   ```bash
   mkdir fly-qdrant && cd fly-qdrant
   flyctl launch --name knowledge-assistant-qdrant --no-deploy
   ```

2. Configure `fly.toml`:
   ```toml
   app = "knowledge-assistant-qdrant"
   primary_region = "ord"
   
   [build]
     image = "qdrant/qdrant:latest"
   
   [env]
     QDRANT__SERVICE__HTTP_PORT = "6333"
     QDRANT__SERVICE__GRPC_PORT = "6334"
   
   [http_service]
     internal_port = 6333
     auto_stop_machines = false
     auto_start_machines = true
     min_machines_running = 1
   
   [mounts]
     source = "qdrant_data"
     destination = "/qdrant/storage"
   
   [[vm]]
     memory = "64mb"
     cpu_kind = "shared"
     cpus = 1
   ```

#### Frontend App

1. Create frontend app:
   ```bash
   mkdir fly-frontend && cd fly-frontend
   flyctl launch --name knowledge-assistant-frontend --no-deploy
   ```

2. Configure `fly.toml`:
   ```toml
   app = "knowledge-assistant-frontend"
   primary_region = "ord"
   
   [build]
     dockerfile = "../rag-quest-hub/Dockerfile"
   
   [env]
     VITE_API_BASE_URL = "https://knowledge-assistant-backend.fly.dev"
   
   [http_service]
     internal_port = 80
     force_https = true
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 0
   
   [[vm]]
     memory = "64mb"
     cpu_kind = "shared"
     cpus = 1
   ```

## Database Configuration

### SQLite (Default)
- Uses persistent volumes for data storage
- Suitable for single-instance deployments
- Automatic backups with volume snapshots

### PostgreSQL (Optional)
```bash
# Add PostgreSQL to your app
flyctl postgres create --name knowledge-assistant-db

# Attach to your app
flyctl postgres attach knowledge-assistant-db

# Update environment variable
flyctl secrets set DATABASE_URL=postgresql://...
```

## External Service Alternatives

### Qdrant Cloud
For better resource utilization:
```bash
flyctl secrets set QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
flyctl secrets set QDRANT_API_KEY=your-api-key
```

### Google Gemini API
Already configured by default:
```bash
flyctl secrets set GEMINI_API_KEY=your-gemini-api-key
```

## Monitoring and Maintenance

### Health Checks
```bash
# Check app status
flyctl status

# View logs
flyctl logs

# Monitor metrics
flyctl metrics
```

### Scaling
```bash
# Scale machines
flyctl scale count 2

# Scale memory
flyctl scale memory 512

# Scale to zero (cost optimization)
flyctl scale count 0
```

### Updates
```bash
# Deploy updates
flyctl deploy

# Rollback if needed
flyctl releases rollback
```

## Cost Optimization

### Free Tier Management
- Use single-app deployment to stay within limits
- Enable auto-stop for cost savings
- Monitor resource usage in dashboard

### Resource Optimization
- Use Alpine Linux base images
- Minimize memory allocation
- Enable machine auto-stop/start

## Troubleshooting

### Common Issues

#### 1. Memory Limit Exceeded
```bash
# Check memory usage
flyctl metrics

# Solutions:
# - Reduce memory allocation in fly.toml
# - Use external services (Qdrant Cloud)
# - Optimize Docker images
```

#### 2. Volume Mount Issues
```bash
# Check volumes
flyctl volumes list

# Create volume if missing
flyctl volumes create knowledge_data --size 1
```

#### 3. Service Communication
```bash
# Check internal DNS
flyctl ssh console
nslookup knowledge-assistant-qdrant.internal

# Update service URLs in configuration
```

#### 4. Build Failures
```bash
# Check build logs
flyctl logs --app knowledge-assistant-rag

# Common fixes:
# - Verify Dockerfile syntax
# - Check base image availability
# - Ensure all files are included
```

### Debug Commands
```bash
# SSH into machine
flyctl ssh console

# Check running processes
flyctl ssh console -C "ps aux"

# View configuration
flyctl config show

# Check machine status
flyctl machine list
```

## Security Considerations

### Secrets Management
- Use `flyctl secrets` for sensitive data
- Never commit secrets to version control
- Rotate secrets regularly

### Network Security
- Internal services use `.internal` domains
- HTTPS enforced by default
- Private networking between apps

### Access Control
- Use Fly.io organizations for team access
- Implement proper authentication in application
- Monitor access logs

## Backup and Recovery

### Volume Snapshots
```bash
# Create snapshot
flyctl volumes snapshots create knowledge_data

# List snapshots
flyctl volumes snapshots list knowledge_data

# Restore from snapshot
flyctl volumes create knowledge_data_restore --snapshot-id snap_xxx
```

### Database Backups
```bash
# For SQLite
flyctl ssh console -C "sqlite3 /app/data/knowledge_assistant.db .dump" > backup.sql

# For PostgreSQL
flyctl postgres db dump knowledge-assistant-db > backup.sql
```

## Performance Optimization

### Cold Start Optimization
- Keep minimum machines running for critical services
- Use smaller base images
- Optimize application startup time

### Regional Deployment
```bash
# Deploy to multiple regions
flyctl regions add lax sea

# Check current regions
flyctl regions list
```

### Caching
- Enable HTTP caching for static assets
- Use Redis for application caching (if needed)
- Implement proper cache headers

## Migration from Other Platforms

### From Railway
1. Export environment variables
2. Create Fly.io apps with similar configuration
3. Migrate data using volume snapshots
4. Update DNS records

### From Docker Compose
1. Convert docker-compose.yml to fly.toml
2. Create separate apps for each service
3. Configure internal networking
4. Deploy and test

## Support and Resources

### Getting Help
- [Fly.io Documentation](https://fly.io/docs/)
- [Fly.io Community Forum](https://community.fly.io/)
- [Fly.io Discord](https://discord.gg/fly)

### Useful Commands
```bash
# Get help
flyctl help

# Check account status
flyctl auth whoami

# View billing
flyctl billing

# Monitor apps
flyctl apps list
```

## Architecture Diagram

### Single App Deployment
```
┌─────────────────────────────────────┐
│         Fly.io Machine              │
│  ┌─────────────┐ ┌─────────────┐    │
│  │   nginx     │ │  Backend    │    │
│  │ (Port 8080) │ │ (Port 8000) │    │
│  └─────────────┘ └─────────────┘    │
│  ┌─────────────┐ ┌─────────────┐    │
│  │   Qdrant    │ │   SQLite    │    │
│  │ (Port 6333) │ │   Database  │    │
│  └─────────────┘ └─────────────┘    │
│                                     │
│  Volume: /app/data (1GB)            │
└─────────────────────────────────────┘
```

### Multi-App Deployment
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │    Qdrant       │
│   (Fly App)     │────│   (Fly App)     │────│   (Fly App)     │
│                 │    │                 │    │                 │
│ React + nginx   │    │ FastAPI + DB    │    │ Vector Database │
│   (64MB RAM)    │    │   (128MB RAM)   │    │   (64MB RAM)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

This deployment provides a cost-effective, scalable solution for running the Knowledge Assistant RAG application on Fly.io's free tier with excellent global performance.