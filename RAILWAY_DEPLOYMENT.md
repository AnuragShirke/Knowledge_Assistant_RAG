# Railway Deployment Guide

This guide covers deploying the Knowledge Assistant RAG application to Railway.app, a platform that offers free hosting with generous resource limits.

## Railway Resource Limits (Free Tier)

- **Memory**: 512MB RAM per service
- **Storage**: 1GB persistent storage
- **Build Time**: 10 minutes
- **Execution Time**: No limits
- **Bandwidth**: 100GB/month
- **Custom Domains**: Supported

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Railway CLI**: Install the Railway CLI
   ```bash
   npm install -g @railway/cli
   # or
   curl -fsSL https://railway.app/install.sh | sh
   ```
3. **Docker**: Ensure Docker is installed locally for testing

## Deployment Options

### Option 1: Single Service Deployment (Recommended for Free Tier)

Deploy the backend service with SQLite database and external services.

#### Step 1: Prepare Environment Variables

1. Copy the Railway environment template:
   ```bash
   cp .env.railway.template .env.railway
   ```

2. Edit `.env.railway` with your values:
   ```bash
   # Required: Generate a secure JWT secret (32+ characters)
   JWT_SECRET=your-super-secure-jwt-secret-key-32-chars-minimum
   
   # Optional: Configure external services
   CORS_ORIGINS=https://your-frontend.railway.app
   VITE_API_BASE_URL=https://your-backend.railway.app
   ```

#### Step 2: Deploy Backend Service

1. Login to Railway:
   ```bash
   railway login
   ```

2. Create a new Railway project:
   ```bash
   railway new
   ```

3. Deploy the backend:
   ```bash
   railway up
   ```

4. Set environment variables:
   ```bash
   railway variables set JWT_SECRET=your-jwt-secret
   railway variables set USER_REGISTRATION_ENABLED=true
   railway variables set CORS_ORIGINS=https://your-domain.com
   ```

#### Step 3: Deploy Frontend Service

1. Navigate to frontend directory:
   ```bash
   cd rag-quest-hub
   ```

2. Create a new Railway service:
   ```bash
   railway service create frontend
   railway up
   ```

3. Set frontend environment variables:
   ```bash
   railway variables set VITE_API_BASE_URL=https://your-backend.railway.app
   railway variables set VITE_ENABLE_REGISTRATION=true
   ```

### Option 2: Multi-Service Deployment

Deploy all services (backend, frontend, qdrant, ollama) as separate Railway services.

⚠️ **Warning**: This approach may exceed free tier limits due to memory usage.

#### Step 1: Deploy Services Individually

1. **Backend Service**:
   ```bash
   railway service create backend
   railway up
   ```

2. **Frontend Service**:
   ```bash
   cd rag-quest-hub
   railway service create frontend
   railway up
   ```

3. **Qdrant Service**:
   ```bash
   railway service create qdrant
   railway deploy --service qdrant --image qdrant/qdrant:latest
   ```

4. **Ollama Service** (High Memory Usage):
   ```bash
   railway service create ollama
   railway deploy --service ollama --image ollama/ollama:latest
   ```

#### Step 2: Configure Service Communication

Set environment variables for internal service communication:

```bash
# Backend service variables
railway variables set QDRANT_HOST=qdrant.railway.internal
railway variables set OLLAMA_HOST=ollama.railway.internal

# Frontend service variables
railway variables set VITE_API_BASE_URL=https://backend.railway.app
```

## Database Configuration

### Option A: SQLite (Default)

Uses local SQLite database with persistent storage:
- **Pros**: Simple, no additional setup
- **Cons**: Limited to single instance, no horizontal scaling

```bash
railway variables set DATABASE_URL=sqlite+aiosqlite:///./data/knowledge_assistant.db
```

### Option B: Railway PostgreSQL

Add Railway's managed PostgreSQL service:

1. Add PostgreSQL to your project:
   ```bash
   railway add postgresql
   ```

2. Railway automatically sets `DATABASE_URL` environment variable

3. Update your application to use PostgreSQL:
   ```bash
   railway variables set DATABASE_URL=$DATABASE_URL
   ```

## External Service Alternatives

For better resource utilization, consider using external managed services:

### Qdrant Cloud

1. Sign up for [Qdrant Cloud](https://cloud.qdrant.io)
2. Create a cluster and get API credentials
3. Set environment variables:
   ```bash
   railway variables set QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
   railway variables set QDRANT_API_KEY=your-api-key
   ```

### OpenAI API (Instead of Ollama)

1. Get OpenAI API key from [platform.openai.com](https://platform.openai.com)
2. Set environment variables:
   ```bash
   railway variables set OPENAI_API_KEY=your-openai-key
   railway variables set USE_OPENAI_INSTEAD_OF_OLLAMA=true
   ```

## Monitoring and Maintenance

### Health Checks

Railway automatically monitors your services. Access logs via:
```bash
railway logs
```

### Scaling

Monitor resource usage in Railway dashboard:
- Memory usage should stay under 512MB
- CPU usage is unlimited on free tier
- Storage usage should stay under 1GB

### Updates

Deploy updates using:
```bash
railway up
```

## Troubleshooting

### Common Issues

1. **Memory Limit Exceeded**:
   - Use external services (Qdrant Cloud, OpenAI API)
   - Optimize Docker images
   - Consider upgrading to Railway Pro

2. **Build Timeout**:
   - Optimize Dockerfile build stages
   - Use smaller base images
   - Pre-build dependencies

3. **Service Communication Issues**:
   - Use Railway internal URLs: `service-name.railway.internal`
   - Check environment variables
   - Verify network configuration

4. **Database Connection Issues**:
   - Ensure DATABASE_URL is correctly set
   - Check PostgreSQL service status
   - Verify database migrations

### Getting Help

- Railway Documentation: [docs.railway.app](https://docs.railway.app)
- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
- Railway Status: [status.railway.app](https://status.railway.app)

## Cost Optimization

### Free Tier Limits

- Stay within 512MB memory per service
- Use external APIs for resource-intensive services
- Monitor bandwidth usage (100GB/month limit)

### Upgrade Considerations

Consider Railway Pro ($5/month) if you need:
- More memory (up to 32GB)
- More services
- Priority support
- Advanced features

## Security Considerations

1. **Environment Variables**: Never commit secrets to git
2. **JWT Secret**: Use a strong, unique secret (32+ characters)
3. **CORS Origins**: Restrict to your actual domains
4. **Database**: Use PostgreSQL for production workloads
5. **HTTPS**: Railway provides HTTPS by default

## Next Steps

After successful deployment:

1. Test all functionality
2. Set up monitoring and alerts
3. Configure custom domain (optional)
4. Set up CI/CD pipeline
5. Plan for scaling and optimization