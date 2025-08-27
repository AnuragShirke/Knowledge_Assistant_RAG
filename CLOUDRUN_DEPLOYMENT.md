# Google Cloud Run Deployment Guide

This guide provides comprehensive instructions for deploying the Knowledge Assistant RAG application to Google Cloud Run.

## Overview

The Knowledge Assistant application is deployed as three separate Cloud Run services:
- **Frontend**: React application served by nginx
- **Backend**: FastAPI application with database and AI integrations
- **Qdrant**: Vector database for document embeddings

## Prerequisites

### Required Tools
- [Google Cloud SDK (gcloud)](https://cloud.google.com/sdk/docs/install)
- [Docker](https://docs.docker.com/get-docker/)
- [Git](https://git-scm.com/downloads)

### Google Cloud Setup
1. Create a Google Cloud Project
2. Enable billing for your project
3. Install and initialize gcloud CLI:
   ```bash
   gcloud init
   gcloud auth login
   ```

### API Keys Required
- **Google Gemini API Key**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)

## Quick Start

### 1. Clone and Setup
```bash
git clone <your-repo-url>
cd Knowledge_Assistant_RAG
```

### 2. Create Environment Configuration
```bash
# Create environment file
./scripts/cloudrun-env-setup.sh create

# This will prompt you for:
# - Google Cloud Project ID
# - Google Gemini API Key
```

### 3. Deploy to Cloud Run
```bash
# Run the complete deployment
./deploy-cloudrun.sh

# Or run individual steps:
./deploy-cloudrun.sh secrets  # Create secrets only
./deploy-cloudrun.sh build    # Build and push images only
./deploy-cloudrun.sh deploy   # Deploy services only
```

### 4. Verify Deployment
```bash
# Run health checks
./scripts/cloudrun-health-check.sh

# Quick check
./scripts/cloudrun-health-check.sh quick
```

## Detailed Deployment Steps

### Step 1: Environment Configuration

Create your environment file:
```bash
./scripts/cloudrun-env-setup.sh create .env.cloudrun
```

Review and modify the generated `.env.cloudrun` file as needed:
```bash
# Key variables to verify:
PROJECT_ID=your-gcp-project-id
GEMINI_API_KEY=your-gemini-api-key
JWT_SECRET=auto-generated-secure-secret
```

### Step 2: Google Cloud Setup

The deployment script will automatically:
- Enable required APIs
- Create service accounts
- Set up IAM permissions
- Create Cloud SQL instance
- Configure Secret Manager

### Step 3: Build and Deploy

The deployment process includes:

1. **Build Docker Images**
   - Backend: Multi-stage Python Alpine build
   - Frontend: Multi-stage Node.js with nginx

2. **Create Cloud Infrastructure**
   - Cloud SQL PostgreSQL instance (free tier)
   - Secret Manager for sensitive data
   - Service accounts with minimal permissions

3. **Deploy Services**
   - Qdrant vector database
   - Backend API with database connection
   - Frontend with proper API configuration

### Step 4: Post-Deployment Configuration

After deployment, update service URLs:
```bash
./scripts/cloudrun-env-setup.sh update-urls .env.cloudrun
```

## Service Configuration

### Resource Limits (Free Tier Optimized)

| Service | Memory | CPU | Min Instances | Max Instances |
|---------|--------|-----|---------------|---------------|
| Frontend | 512Mi | 1000m | 0 | 10 |
| Backend | 1Gi | 1000m | 0 | 10 |
| Qdrant | 512Mi | 1000m | 1 | 5 |

### Environment Variables

#### Frontend
- `VITE_API_BASE_URL`: Backend service URL
- `VITE_API_TIMEOUT`: API request timeout
- `VITE_ENABLE_REGISTRATION`: Enable user registration

#### Backend
- `DATABASE_URL`: Cloud SQL connection string (from Secret Manager)
- `JWT_SECRET`: JWT signing secret (from Secret Manager)
- `GEMINI_API_KEY`: Google Gemini API key (from Secret Manager)
- `QDRANT_HOST`: Qdrant service URL
- `CORS_ORIGINS`: Allowed frontend origins

#### Qdrant
- `QDRANT__SERVICE__HTTP_PORT`: HTTP port (6333)
- `QDRANT__SERVICE__GRPC_PORT`: gRPC port (6334)

## Security Configuration

### Service Accounts
- **Backend Service Account**: Access to Cloud SQL and Secret Manager
- **Qdrant Service Account**: Basic Cloud Run permissions

### IAM Roles
- `roles/cloudsql.client`: Cloud SQL access
- `roles/secretmanager.secretAccessor`: Secret Manager access
- `roles/run.invoker`: Service-to-service communication

### Secrets Management
All sensitive data is stored in Google Secret Manager:
- JWT signing secret
- Database connection string
- API keys

## Monitoring and Maintenance

### Health Checks
```bash
# Comprehensive health check
./scripts/cloudrun-health-check.sh comprehensive

# Quick status check
./scripts/cloudrun-health-check.sh quick

# Check specific service logs
./scripts/cloudrun-health-check.sh logs knowledge-assistant-backend 100
```

### Viewing Logs
```bash
# Backend logs
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"knowledge-assistant-backend\"" --limit=50

# Frontend logs
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"knowledge-assistant-frontend\"" --limit=50
```

### Scaling Configuration
Services auto-scale based on traffic:
- **Scale to zero**: When no requests (saves costs)
- **Auto-scale up**: Based on CPU and memory usage
- **Max instances**: Prevents runaway costs

## Cost Optimization

### Free Tier Limits
- **Cloud Run**: 2 million requests/month, 400,000 GB-seconds/month
- **Cloud SQL**: db-f1-micro instance, 10GB storage
- **Secret Manager**: 6 active secret versions

### Cost-Saving Features
- Scale-to-zero for frontend and backend
- Minimal resource allocation
- Efficient container images
- Request-based billing

## Troubleshooting

### Common Issues

#### 1. Build Failures
```bash
# Check build logs
gcloud builds log <BUILD_ID>

# Common fixes:
# - Increase build timeout
# - Check Dockerfile syntax
# - Verify base image availability
```

#### 2. Service Not Starting
```bash
# Check service logs
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"SERVICE_NAME\"" --limit=20

# Common fixes:
# - Check environment variables
# - Verify secret access
# - Check resource limits
```

#### 3. Database Connection Issues
```bash
# Test Cloud SQL connection
gcloud sql connect knowledge-assistant-db --user=knowledge-assistant-user

# Common fixes:
# - Check service account permissions
# - Verify Cloud SQL instance is running
# - Check connection string format
```

#### 4. Service Communication Issues
```bash
# Check CORS configuration
curl -X OPTIONS -H "Origin: https://your-frontend-url" https://your-backend-url/health

# Common fixes:
# - Update CORS_ORIGINS environment variable
# - Check service URLs in frontend configuration
# - Verify IAM permissions for service-to-service calls
```

### Debug Commands
```bash
# Get service details
gcloud run services describe SERVICE_NAME --region=us-central1

# Check recent deployments
gcloud run revisions list --service=SERVICE_NAME --region=us-central1

# View service configuration
gcloud run services describe SERVICE_NAME --region=us-central1 --format=yaml
```

## Updating the Application

### Code Updates
```bash
# Rebuild and redeploy
./deploy-cloudrun.sh build
./deploy-cloudrun.sh deploy
```

### Configuration Updates
```bash
# Update environment variables
gcloud run services update SERVICE_NAME --region=us-central1 --set-env-vars="KEY=VALUE"

# Update secrets
./scripts/cloudrun-env-setup.sh create-secrets .env.cloudrun
```

### Database Migrations
```bash
# Connect to Cloud SQL
gcloud sql connect knowledge-assistant-db --user=knowledge-assistant-user

# Run migrations (if using Alembic)
# This would be handled automatically by the backend service on startup
```

## Cleanup

### Remove All Resources
```bash
# Delete Cloud Run services
gcloud run services delete knowledge-assistant-frontend --region=us-central1
gcloud run services delete knowledge-assistant-backend --region=us-central1
gcloud run services delete knowledge-assistant-qdrant --region=us-central1

# Delete Cloud SQL instance
gcloud sql instances delete knowledge-assistant-db

# Delete secrets
gcloud secrets delete knowledge-assistant-secrets

# Delete service accounts
gcloud iam service-accounts delete knowledge-assistant-backend-sa@PROJECT_ID.iam.gserviceaccount.com
gcloud iam service-accounts delete knowledge-assistant-qdrant-sa@PROJECT_ID.iam.gserviceaccount.com
```

## Support

### Getting Help
- Check the [troubleshooting section](#troubleshooting) above
- Review Cloud Run logs for error messages
- Verify all prerequisites are met
- Ensure API quotas are not exceeded

### Useful Resources
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Google Gemini API Documentation](https://ai.google.dev/docs)

## Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │    Qdrant       │
│  (Cloud Run)    │────│  (Cloud Run)    │────│  (Cloud Run)    │
│                 │    │                 │    │                 │
│ React + nginx   │    │ FastAPI + DB    │    │ Vector Database │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              │
                       ┌─────────────────┐
                       │   Cloud SQL     │
                       │  (PostgreSQL)   │
                       └─────────────────┘
                              │
                       ┌─────────────────┐
                       │ Secret Manager  │
                       │   (Secrets)     │
                       └─────────────────┘
```

This deployment provides a scalable, cost-effective solution for running the Knowledge Assistant RAG application on Google Cloud Platform's free tier.