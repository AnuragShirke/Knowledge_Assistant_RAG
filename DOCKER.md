# Docker Configuration for Knowledge Assistant RAG

This document describes the Docker setup for the Knowledge Assistant RAG application with authentication support.

## Overview

The application consists of multiple services:
- **Frontend**: React application (rag-quest-hub)
- **Backend**: FastAPI application with authentication
- **Database**: SQLite (development) or PostgreSQL (production)
- **Qdrant**: Vector database for document embeddings
- **Ollama**: Local LLM service

## Environment Variables

### Backend Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | Database connection string | `sqlite:///./data/knowledge_assistant.db` | No |
| `JWT_SECRET` | Secret key for JWT tokens | - | **Yes** |
| `JWT_LIFETIME_SECONDS` | JWT token lifetime in seconds | `3600` | No |
| `USER_REGISTRATION_ENABLED` | Enable user registration | `true` | No |
| `EMAIL_VERIFICATION_REQUIRED` | Require email verification | `false` | No |
| `QDRANT_HOST` | Qdrant service hostname | `qdrant` | No |
| `OLLAMA_HOST` | Ollama service hostname | `ollama` | No |
| `OLLAMA_MODEL` | Ollama model to use | `llama3.2:1b` | No |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000,...` | No |

### Frontend Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `VITE_API_BASE_URL` | Backend API URL | `http://localhost:8000` | No |
| `VITE_API_TIMEOUT` | API request timeout (ms) | `30000` | No |
| `VITE_ENABLE_REGISTRATION` | Show registration form | `true` | No |

## Development Setup

### Prerequisites
- Docker and Docker Compose
- At least 4GB RAM available for containers

### Quick Start

1. **Clone and navigate to the project:**
   ```bash
   cd Knowledge_Assistant_RAG
   ```

2. **Create environment file (optional):**
   ```bash
   cp .env.example .env
   # Edit .env with your preferred settings
   ```

3. **Start all services:**
   ```bash
   docker-compose up --build
   ```

4. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs
   - Qdrant Dashboard: http://localhost:6333/dashboard

### Development with Hot Reload

The development setup includes volume mounts for hot reload:
- Frontend source code changes are reflected immediately
- Backend source code changes require container restart

## Production Setup

### SQLite (Simple Production)

For simple production deployments with SQLite:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Important**: Set the `JWT_SECRET` environment variable:
```bash
export JWT_SECRET="your-super-secure-secret-key-here"
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### PostgreSQL (Scalable Production)

For production deployments with PostgreSQL:

```bash
# Set database credentials
export POSTGRES_PASSWORD="your-secure-password"
export JWT_SECRET="your-super-secure-secret-key-here"

# Start with PostgreSQL
docker-compose -f docker-compose.yml -f docker-compose.postgres.yml up -d
```

## Database Management

### Migrations

Database migrations are automatically run on container startup via the `init-db.sh` script.

### Manual Migration Commands

To run migrations manually:

```bash
# Enter the backend container
docker-compose exec backend bash

# Run migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "Description of changes"
```

### Database Health Check

Check database connectivity:

```bash
# Run health check script
docker-compose exec backend /app/scripts/check-db-health.sh

# Or check via API
curl http://localhost:8000/health
```

### Backup and Restore (SQLite)

**Backup:**
```bash
# Copy database file from container
docker-compose exec backend cp /app/data/knowledge_assistant.db /tmp/
docker cp $(docker-compose ps -q backend):/tmp/knowledge_assistant.db ./backup.db
```

**Restore:**
```bash
# Copy backup to container
docker cp ./backup.db $(docker-compose ps -q backend):/app/data/knowledge_assistant.db
docker-compose restart backend
```

## Troubleshooting

### Common Issues

1. **Database migration failures:**
   ```bash
   # Check logs
   docker-compose logs backend
   
   # Reset database (development only)
   docker-compose down -v
   docker-compose up --build
   ```

2. **JWT secret not set:**
   ```
   Error: JWT_SECRET environment variable is required
   ```
   Solution: Set the JWT_SECRET environment variable before starting containers.

3. **Permission issues with database:**
   ```bash
   # Fix permissions
   docker-compose exec backend chmod 755 /app/data
   docker-compose exec backend chmod 644 /app/data/knowledge_assistant.db
   ```

4. **Frontend can't connect to backend:**
   - Check that `VITE_API_BASE_URL` points to the correct backend URL
   - Verify CORS settings in backend configuration

### Health Checks

The application includes comprehensive health checks:

- **Container health**: Docker health checks for all services
- **API health**: `/health` endpoint with service status
- **Database health**: Automatic connectivity verification

### Logs

View logs for specific services:

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

## Security Considerations

### Production Security

1. **Change default secrets:**
   - Set a strong `JWT_SECRET` (256-bit recommended)
   - Use secure database passwords

2. **Network security:**
   - Use reverse proxy (nginx) for HTTPS
   - Restrict database access to backend only
   - Configure firewall rules

3. **Data persistence:**
   - Use named volumes for data persistence
   - Regular database backups
   - Monitor disk usage

### Environment Variables Security

Never commit sensitive environment variables to version control. Use:
- `.env` files (gitignored)
- Docker secrets
- External secret management systems

## Monitoring

### Health Monitoring

The `/health` endpoint provides detailed service status:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z",
  "services": {
    "database": {"status": "healthy", "type": "sqlite"},
    "qdrant": {"status": "healthy", "collections_count": 5},
    "ollama": {"status": "healthy", "model": "llama3.2:1b"},
    "embedding_model": {"status": "healthy", "embedding_dimension": 384}
  }
}
```

### Performance Monitoring

Monitor resource usage:

```bash
# Container resource usage
docker stats

# Disk usage
docker system df
```

## Scaling

### Horizontal Scaling

For high-traffic deployments:

1. **Load balancer**: Use nginx or similar for load balancing
2. **Database**: Use PostgreSQL with connection pooling
3. **Caching**: Add Redis for session/query caching
4. **Storage**: Use external storage for document uploads

### Vertical Scaling

Adjust resource limits in docker-compose.yml:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '1.0'
```