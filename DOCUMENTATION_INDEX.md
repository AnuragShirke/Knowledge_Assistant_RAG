# Documentation Index

This document provides an overview of all available documentation for the Knowledge Assistant RAG application deployment and maintenance.

## 📚 Documentation Overview

The Knowledge Assistant RAG application includes comprehensive documentation covering deployment, configuration, troubleshooting, and maintenance across multiple platforms.

## 🚀 Deployment Guides

### Platform-Specific Deployment
- **[Railway Deployment Guide](RAILWAY_DEPLOYMENT.md)** - Deploy to Railway.app (free tier: 512MB RAM, 1GB storage)
- **[Fly.io Deployment Guide](FLY_DEPLOYMENT.md)** - Deploy to Fly.io (free tier: 256MB RAM, 1GB storage)
- **[Google Cloud Run Deployment Guide](CLOUDRUN_DEPLOYMENT.md)** - Deploy to Google Cloud Run (free tier: 1GB memory, 2 vCPU)
- **[Deployment Automation](DEPLOYMENT_AUTOMATION.md)** - Automated deployment scripts and utilities

### Quick Start
1. Choose your preferred platform from the guides above
2. Follow the platform-specific prerequisites
3. Run the deployment script: `./deploy.sh platform-name`
4. Configure environment variables as documented

## ⚙️ Configuration

### Environment Setup
- **[Environment Configuration Guide](ENVIRONMENT_CONFIGURATION.md)** - Comprehensive guide for environment variables and secrets management
  - Core environment variables
  - Platform-specific configuration
  - Secrets management best practices
  - Validation and testing scripts

### Key Configuration Files
- `.env.railway` - Railway deployment configuration
- `.env.fly` - Fly.io deployment configuration  
- `.env.cloudrun` - Google Cloud Run configuration
- `.env.vercel` - Vercel hybrid deployment configuration

## 🔧 Troubleshooting and Maintenance

### Problem Resolution
- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Comprehensive troubleshooting for common issues
  - Common deployment issues
  - Platform-specific problems
  - Service communication issues
  - Database problems
  - Emergency recovery procedures

### Performance and Optimization
- **[Performance Optimization Guide](PERFORMANCE_OPTIMIZATION.md)** - Strategies for optimizing performance and scaling
  - Container optimization
  - Database performance tuning
  - API optimization
  - Scaling strategies
  - Cost optimization

### Frequently Asked Questions
- **[FAQ](FAQ.md)** - Answers to common questions about deployment, configuration, and maintenance
  - General questions
  - Deployment questions
  - Configuration questions
  - Performance questions
  - Security questions
  - Cost and scaling questions

## 📋 Quick Reference

### Essential Commands

#### Deployment
```bash
# Deploy to Railway
./deploy.sh railway

# Deploy to Fly.io
./deploy.sh fly

# Deploy to Google Cloud Run
./deploy.sh cloudrun

# Deploy locally
./deploy.sh local
```

#### Health Checks
```bash
# Run comprehensive health check
./scripts/health-check.sh

# Validate deployment
./scripts/validate-deployment.sh

# Check environment variables
./scripts/validate-environment.sh
```

#### Maintenance
```bash
# Database backup
./scripts/migrate-database.sh backup

# Performance monitoring
./scripts/performance-report.sh

# Clean up resources
docker system prune -a
```

### Environment Variables Quick Reference

#### Required Variables
```bash
JWT_SECRET=your-32-character-minimum-secret
GEMINI_API_KEY=your-google-gemini-api-key
DATABASE_URL=sqlite+aiosqlite:///./data/knowledge_assistant.db
```

#### Optional Variables
```bash
QDRANT_CLOUD_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-api-key
CORS_ORIGINS=https://your-domain.com
USER_REGISTRATION_ENABLED=true
```

### Platform Resource Limits

| Platform | Memory | Storage | CPU | Cost |
|----------|--------|---------|-----|------|
| Railway | 512MB | 1GB | Shared | Free |
| Fly.io | 256MB | 1GB | Shared | Free |
| Cloud Run | 1GB | N/A | 1 vCPU | Free tier |
| Vercel | N/A | N/A | Serverless | Free |

## 🆘 Getting Help

### Documentation Hierarchy
1. **Start with FAQ** - Check if your question is already answered
2. **Platform-specific guides** - For deployment issues
3. **Troubleshooting guide** - For runtime problems
4. **Environment configuration** - For setup issues
5. **Performance guide** - For optimization needs

### Support Channels
- **Platform Documentation**: Check official platform docs
- **Community Forums**: Platform-specific Discord/forums
- **Issue Tracking**: Create detailed bug reports with logs
- **Performance Issues**: Use monitoring tools and guides

### Diagnostic Information
When seeking help, include:
- Platform and deployment method
- Error messages and logs
- Environment configuration (without secrets)
- Steps to reproduce the issue

## 📈 Monitoring and Maintenance

### Regular Tasks
- **Daily**: Health checks and log monitoring
- **Weekly**: Performance reviews and cleanup
- **Monthly**: Security updates and backup verification

### Key Metrics to Monitor
- Response times (< 200ms target)
- Memory usage (stay within platform limits)
- Error rates (< 1% target)
- Disk usage (monitor growth)

### Alerting Setup
Configure alerts for:
- Service downtime
- High error rates
- Resource limit approaching
- Failed deployments

## 🔄 Updates and Maintenance

### Updating the Application
1. **Test locally** with new changes
2. **Backup data** before deployment
3. **Deploy to staging** (if available)
4. **Deploy to production** using deployment scripts
5. **Verify functionality** with health checks

### Security Maintenance
- Rotate JWT secrets quarterly
- Update API keys as needed
- Monitor for security updates
- Review access logs regularly

## 📊 Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   External      │
│  (React/Vite)   │────│   (FastAPI)     │────│   Services      │
│                 │    │                 │    │                 │
│ • User Interface│    │ • API Endpoints │    │ • Gemini API    │
│ • Document UI   │    │ • Auth System   │    │ • Qdrant Cloud  │
│ • Chat Interface│    │ • File Processing│    │ • PostgreSQL   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                       ┌─────────────────┐
                       │   Database      │
                       │  (SQLite/PG)    │
                       │                 │
                       │ • User Data     │
                       │ • Documents     │
                       │ • Metadata      │
                       └─────────────────┘
```

## 🎯 Best Practices Summary

### Deployment
- Use external services for free tier deployments
- Implement proper health checks
- Configure auto-scaling appropriately
- Use platform-specific optimizations

### Security
- Never commit secrets to version control
- Use strong JWT secrets (32+ characters)
- Restrict CORS to specific domains
- Implement proper authentication

### Performance
- Use caching where appropriate
- Optimize Docker images for size
- Monitor resource usage regularly
- Implement graceful degradation

### Maintenance
- Automate backups and health checks
- Monitor logs and metrics
- Keep dependencies updated
- Document configuration changes

This documentation index provides a comprehensive overview of all available resources for successfully deploying and maintaining the Knowledge Assistant RAG application across multiple platforms.