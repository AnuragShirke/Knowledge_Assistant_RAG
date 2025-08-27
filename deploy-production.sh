#!/bin/bash

# Production deployment script for Knowledge Assistant RAG
set -e

echo "🚀 Starting production deployment..."

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production file not found!"
    echo "📝 Please copy .env.production.template to .env.production and configure it."
    exit 1
fi

# Validate required environment variables
echo "🔍 Validating environment configuration..."
source .env.production

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your-super-secure-jwt-secret-key-change-this-in-production" ]; then
    echo "❌ JWT_SECRET must be set to a secure value in .env.production"
    exit 1
fi

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down

# Remove old images to save space
echo "🧹 Cleaning up old images..."
docker system prune -f

# Build and start services
echo "🔨 Building optimized containers..."
docker-compose -f docker-compose.prod.yml build --no-cache

echo "🚀 Starting production services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 30

# Check service health
echo "🏥 Checking service health..."
if docker-compose -f docker-compose.prod.yml ps | grep -q "unhealthy"; then
    echo "❌ Some services are unhealthy. Check logs:"
    docker-compose -f docker-compose.prod.yml logs
    exit 1
fi

echo "✅ Production deployment completed successfully!"
echo "🌐 Frontend available at: http://localhost:3000"
echo "🔧 Backend API available at: http://localhost:8000"
echo "📊 Qdrant available at: http://localhost:6333"
echo "🤖 Ollama available at: http://localhost:11434"

echo ""
echo "📋 To view logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "🛑 To stop: docker-compose -f docker-compose.prod.yml down"