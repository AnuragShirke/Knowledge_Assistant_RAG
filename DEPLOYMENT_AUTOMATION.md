# Deployment Automation Scripts

This document describes the deployment automation scripts created for the Knowledge Assistant RAG application.

## Overview

The deployment automation system provides a comprehensive set of tools for deploying, monitoring, and maintaining the Knowledge Assistant RAG application across multiple platforms.

## Scripts

### 1. Master Deployment Script (`deploy.sh`)

The main deployment script that provides an interactive interface for deploying to various platforms.

**Usage:**
```bash
./deploy.sh [OPTIONS] [PLATFORM]
```

**Platforms:**
- `railway` - Deploy to Railway.app (free tier)
- `fly` - Deploy to Fly.io (free tier) 
- `cloudrun` - Deploy to Google Cloud Run
- `vercel` - Deploy to Vercel (hybrid deployment)
- `local` - Deploy locally with Docker

**Key Features:**
- Interactive platform selection
- Pre-deployment validation
- Environment configuration checking
- Automated prerequisite verification
- Rollback capabilities
- Dry-run mode for testing

**Examples:**
```bash
# Interactive deployment
./deploy.sh

# Deploy to Railway
./deploy.sh railway

# Validate prerequisites only
./deploy.sh --validate-only

# Show deployment plan without executing
./deploy.sh cloudrun --dry-run

# Deploy only backend services
./deploy.sh railway --backend-only
```

### 2. Deployment Utilities (`scripts/deployment-utils.sh`)

A library of common deployment functions and utilities used by other scripts.

**Key Functions:**
- `generate_jwt_secret()` - Generate secure JWT secrets
- `wait_for_service()` - Wait for services to become ready
- `check_service_health()` - Perform health checks
- `backup_sqlite_database()` - Create database backups
- `validate_env_file()` - Validate environment configurations
- `cleanup_docker_images()` - Clean up old Docker images

### 3. Health Check Script (`scripts/health-check.sh`)

Comprehensive health monitoring for all application services.

**Usage:**
```bash
./scripts/health-check.sh [OPTIONS]
```

**Features:**
- Service health monitoring
- Database connectivity checks
- External API validation
- System resource monitoring
- Docker container status
- Detailed health reports

**Examples:**
```bash
# Check all services
./scripts/health-check.sh

# Check specific platform
./scripts/health-check.sh --platform railway

# Save report to file
./scripts/health-check.sh --output health-report.txt

# Skip external API checks
./scripts/health-check.sh --no-external
```

### 4. Deployment Validation (`scripts/validate-deployment.sh`)

End-to-end functional testing of deployed applications.

**Usage:**
```bash
./scripts/validate-deployment.sh [OPTIONS]
```

**Test Coverage:**
- User registration and authentication
- Document upload functionality
- Query processing
- API documentation accessibility
- Database connectivity
- Performance testing

**Examples:**
```bash
# Validate local deployment
./scripts/validate-deployment.sh

# Validate specific URLs
./scripts/validate-deployment.sh \
  --backend-url https://api.example.com \
  --frontend-url https://app.example.com

# Skip functional tests
./scripts/validate-deployment.sh --skip-functional
```

### 5. Database Migration (`scripts/migrate-database.sh`)

Database migration and maintenance utilities.

**Usage:**
```bash
./scripts/migrate-database.sh ACTION [OPTIONS]
```

**Actions:**
- `init` - Initialize database with migrations
- `migrate` - Run pending migrations
- `rollback` - Rollback migrations
- `status` - Show migration status
- `backup` - Create database backup
- `reset` - Reset database (DANGEROUS)

**Examples:**
```bash
# Initialize database
./scripts/migrate-database.sh init

# Run migrations
./scripts/migrate-database.sh migrate

# Create backup
./scripts/migrate-database.sh backup

# Check status
./scripts/migrate-database.sh status
```

## Workflow

### Typical Deployment Workflow

1. **Preparation**
   ```bash
   # Validate prerequisites
   ./deploy.sh --validate-only
   ```

2. **Deployment**
   ```bash
   # Deploy to chosen platform
   ./deploy.sh railway
   ```

3. **Validation**
   ```bash
   # Run health checks
   ./scripts/health-check.sh --platform railway
   
   # Validate functionality
   ./scripts/validate-deployment.sh
   ```

4. **Monitoring**
   ```bash
   # Continuous health monitoring
   ./scripts/health-check.sh --output daily-health.txt
   ```

### Database Management Workflow

1. **Backup**
   ```bash
   ./scripts/migrate-database.sh backup
   ```

2. **Migration**
   ```bash
   ./scripts/migrate-database.sh migrate
   ```

3. **Validation**
   ```bash
   ./scripts/migrate-database.sh status
   ```

## Environment Configuration

Each platform requires specific environment configuration:

- **Railway**: `.env.railway`
- **Fly.io**: `.env.fly`
- **Cloud Run**: `.env.cloudrun`
- **Vercel**: `.env.vercel`
- **Local**: `.env.production`

The scripts will automatically create these files from templates if they don't exist.

## Error Handling and Rollback

All scripts include comprehensive error handling:

- **Automatic Rollback**: Failed deployments can be automatically rolled back
- **Backup Creation**: Databases are backed up before migrations
- **Health Monitoring**: Continuous monitoring detects issues early
- **Detailed Logging**: All operations are logged with timestamps

## Security Features

- **JWT Secret Validation**: Ensures secure authentication tokens
- **Environment Validation**: Prevents deployment with insecure configurations
- **Secret Management**: Proper handling of sensitive information
- **Access Control**: Platform-specific authentication requirements

## Monitoring and Maintenance

### Daily Operations
```bash
# Daily health check
./scripts/health-check.sh --output logs/health-$(date +%Y%m%d).txt

# Weekly validation
./scripts/validate-deployment.sh --output logs/validation-$(date +%Y%m%d).txt
```

### Maintenance Tasks
```bash
# Clean up old Docker images
source scripts/deployment-utils.sh && cleanup_docker_images

# Database backup
./scripts/migrate-database.sh backup

# System resource check
./scripts/health-check.sh | grep -E "(Memory|Disk|CPU)"
```

## Troubleshooting

### Common Issues

1. **Prerequisites Missing**
   - Run `./deploy.sh --validate-only` to check requirements
   - Install missing CLI tools as indicated

2. **Environment Configuration**
   - Check environment files exist and have correct values
   - Validate JWT secrets are secure (32+ characters)

3. **Service Health Issues**
   - Use `./scripts/health-check.sh` to identify problems
   - Check logs for specific error messages

4. **Database Problems**
   - Use `./scripts/migrate-database.sh status` to check migrations
   - Create backups before making changes

### Getting Help

Each script includes detailed help information:
```bash
./deploy.sh --help
./scripts/health-check.sh --help
./scripts/validate-deployment.sh --help
./scripts/migrate-database.sh --help
```

## Integration with Existing Scripts

The automation scripts integrate with existing platform-specific deployment scripts:

- `deploy-railway.sh` - Railway deployment
- `deploy-cloudrun.sh` - Google Cloud Run deployment  
- `deploy-production.sh` - Local Docker deployment

The master script (`deploy.sh`) orchestrates these existing scripts while adding validation, monitoring, and error handling capabilities.