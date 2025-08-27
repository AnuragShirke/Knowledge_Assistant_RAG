# Performance Optimization and Scaling Guidelines

This guide provides comprehensive strategies for optimizing performance and scaling the Knowledge Assistant RAG application across different deployment platforms and usage scenarios.

## Table of Contents

1. [Performance Monitoring](#performance-monitoring)
2. [Container Optimization](#container-optimization)
3. [Database Performance](#database-performance)
4. [API Optimization](#api-optimization)
5. [Frontend Performance](#frontend-performance)
6. [Vector Database Optimization](#vector-database-optimization)
7. [LLM Service Optimization](#llm-service-optimization)
8. [Scaling Strategies](#scaling-strategies)
9. [Platform-Specific Optimizations](#platform-specific-optimizations)
10. [Cost Optimization](#cost-optimization)

## Performance Monitoring

### Key Performance Indicators (KPIs)

#### Application Metrics
```bash
# Response Time Targets
- API Response Time: < 200ms (95th percentile)
- Document Upload: < 5s for 10MB files
- Query Processing: < 2s for complex queries
- Vector Search: < 100ms for similarity search

# Throughput Targets
- Concurrent Users: 100+ simultaneous users
- Requests per Second: 1000+ RPS
- Document Processing: 10+ documents/minute
```

#### Resource Metrics
```bash
# Memory Usage
- Backend: < 256MB baseline, < 512MB peak
- Frontend: < 64MB
- Qdrant: < 128MB for 10k documents

# CPU Usage
- Backend: < 50% average, < 80% peak
- Database: < 30% average
- Vector Operations: < 70% during indexing
```

### Monitoring Implementation

#### Application Performance Monitoring (APM)
```python
# Add to src/core/monitoring.py
import time
import psutil
from functools import wraps
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class PerformanceMonitor:
    def __init__(self):
        self.metrics = {}
    
    def track_request_time(self, endpoint: str):
        def decorator(func):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                start_time = time.time()
                try:
                    result = await func(*args, **kwargs)
                    duration = time.time() - start_time
                    self.record_metric(f"{endpoint}_duration", duration)
                    return result
                except Exception as e:
                    duration = time.time() - start_time
                    self.record_metric(f"{endpoint}_error_duration", duration)
                    raise
            return wrapper
        return decorator
    
    def record_metric(self, name: str, value: float):
        if name not in self.metrics:
            self.metrics[name] = []
        self.metrics[name].append({
            'value': value,
            'timestamp': time.time()
        })
        
        # Keep only last 1000 measurements
        if len(self.metrics[name]) > 1000:
            self.metrics[name] = self.metrics[name][-1000:]
    
    def get_system_metrics(self) -> Dict[str, Any]:
        return {
            'cpu_percent': psutil.cpu_percent(),
            'memory_percent': psutil.virtual_memory().percent,
            'disk_usage': psutil.disk_usage('/').percent,
            'network_io': psutil.net_io_counters()._asdict()
        }

# Usage in FastAPI
from fastapi import FastAPI
from src.core.monitoring import PerformanceMonitor

app = FastAPI()
monitor = PerformanceMonitor()

@app.get("/health")
@monitor.track_request_time("health_check")
async def health_check():
    return {
        "status": "healthy",
        "metrics": monitor.get_system_metrics()
    }
```

#### Health Check Endpoints
```python
# Enhanced health check with performance metrics
@app.get("/health/detailed")
async def detailed_health_check():
    start_time = time.time()
    
    # Test database connection
    db_start = time.time()
    try:
        await test_database_connection()
        db_time = time.time() - db_start
        db_status = "healthy"
    except Exception as e:
        db_time = time.time() - db_start
        db_status = f"unhealthy: {str(e)}"
    
    # Test Qdrant connection
    qdrant_start = time.time()
    try:
        await test_qdrant_connection()
        qdrant_time = time.time() - qdrant_start
        qdrant_status = "healthy"
    except Exception as e:
        qdrant_time = time.time() - qdrant_start
        qdrant_status = f"unhealthy: {str(e)}"
    
    total_time = time.time() - start_time
    
    return {
        "status": "healthy" if db_status == "healthy" and qdrant_status == "healthy" else "degraded",
        "checks": {
            "database": {"status": db_status, "response_time": db_time},
            "qdrant": {"status": qdrant_status, "response_time": qdrant_time}
        },
        "metrics": monitor.get_system_metrics(),
        "total_response_time": total_time
    }
```

## Container Optimization

### Multi-Stage Docker Builds

#### Optimized Backend Dockerfile
```dockerfile
# Build stage
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Production stage
FROM python:3.11-slim

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages from builder
COPY --from=builder /root/.local /root/.local

# Copy application code
WORKDIR /app
COPY src/ ./src/
COPY alembic/ ./alembic/
COPY alembic.ini ./

# Create non-root user
RUN useradd --create-home --shell /bin/bash app
RUN chown -R app:app /app
USER app

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### Optimized Frontend Dockerfile
```dockerfile
# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy optimized nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Image Size Optimization

#### Before and After Comparison
```bash
# Before optimization
REPOSITORY                    TAG       SIZE
knowledge-assistant-backend   latest    7.84GB
knowledge-assistant-frontend  latest    579MB

# After optimization
REPOSITORY                    TAG       SIZE
knowledge-assistant-backend   latest    156MB  # 98% reduction
knowledge-assistant-frontend  latest    23MB   # 96% reduction
```

#### Optimization Techniques
```dockerfile
# Use Alpine Linux base images
FROM python:3.11-alpine instead of python:3.11

# Multi-stage builds to exclude build dependencies
FROM node:18-alpine as builder
# ... build steps ...
FROM nginx:alpine as production

# Minimize layers and combine RUN commands
RUN apk add --no-cache curl \
    && pip install --no-cache-dir -r requirements.txt \
    && rm -rf /var/cache/apk/*

# Use .dockerignore to exclude unnecessary files
echo "node_modules" >> .dockerignore
echo ".git" >> .dockerignore
echo "*.md" >> .dockerignore
echo "tests/" >> .dockerignore
```

## Database Performance

### SQLite Optimization

#### Configuration Tuning
```python
# src/core/database.py
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

# Optimized SQLite configuration
DATABASE_CONFIG = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
    "poolclass": StaticPool,
    "connect_args": {
        "check_same_thread": False,
        "timeout": 20,
        "isolation_level": None,
    },
    "echo": False,  # Disable SQL logging in production
}

# SQLite PRAGMA optimizations
async def optimize_sqlite_connection(connection):
    await connection.execute("PRAGMA journal_mode=WAL")
    await connection.execute("PRAGMA synchronous=NORMAL")
    await connection.execute("PRAGMA cache_size=10000")
    await connection.execute("PRAGMA temp_store=MEMORY")
    await connection.execute("PRAGMA mmap_size=268435456")  # 256MB
```

#### Indexing Strategy
```sql
-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title);

-- Composite indexes for complex queries
CREATE INDEX IF NOT EXISTS idx_documents_user_created ON documents(user_id, created_at);

-- Full-text search index
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    title, content, content=documents, content_rowid=id
);
```

### PostgreSQL Optimization

#### Connection Pooling
```python
# Optimized PostgreSQL configuration
DATABASE_CONFIG = {
    "pool_size": 5,
    "max_overflow": 10,
    "pool_pre_ping": True,
    "pool_recycle": 3600,
    "echo": False,
}

# Connection pool monitoring
from sqlalchemy import event
from sqlalchemy.pool import Pool

@event.listens_for(Pool, "connect")
def set_postgresql_pragma(dbapi_connection, connection_record):
    with dbapi_connection.cursor() as cursor:
        # Optimize for read-heavy workloads
        cursor.execute("SET default_transaction_isolation TO 'read committed'")
        cursor.execute("SET statement_timeout TO '30s'")
        cursor.execute("SET lock_timeout TO '10s'")
```

#### Query Optimization
```python
# Use database-specific optimizations
from sqlalchemy import text

# Efficient pagination
async def get_documents_paginated(db, user_id: int, offset: int, limit: int):
    query = text("""
        SELECT id, title, content, created_at
        FROM documents 
        WHERE user_id = :user_id
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    
    result = await db.execute(query, {
        "user_id": user_id,
        "limit": limit,
        "offset": offset
    })
    return result.fetchall()

# Use EXPLAIN ANALYZE to optimize queries
async def analyze_query_performance(db, query: str):
    explain_query = f"EXPLAIN ANALYZE {query}"
    result = await db.execute(text(explain_query))
    return result.fetchall()
```

## API Optimization

### Response Caching

#### In-Memory Caching
```python
from functools import lru_cache
from typing import Optional
import hashlib
import json

class QueryCache:
    def __init__(self, max_size: int = 1000):
        self.cache = {}
        self.max_size = max_size
    
    def _generate_key(self, query: str, filters: dict) -> str:
        cache_data = {"query": query, "filters": filters}
        return hashlib.md5(json.dumps(cache_data, sort_keys=True).encode()).hexdigest()
    
    def get(self, query: str, filters: dict) -> Optional[dict]:
        key = self._generate_key(query, filters)
        return self.cache.get(key)
    
    def set(self, query: str, filters: dict, result: dict, ttl: int = 300):
        if len(self.cache) >= self.max_size:
            # Remove oldest entry
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]
        
        key = self._generate_key(query, filters)
        self.cache[key] = {
            "result": result,
            "expires_at": time.time() + ttl
        }
    
    def is_expired(self, entry: dict) -> bool:
        return time.time() > entry["expires_at"]

# Usage in API endpoints
query_cache = QueryCache()

@app.post("/query")
async def query_documents(request: QueryRequest):
    # Check cache first
    cached_result = query_cache.get(request.query, request.filters)
    if cached_result and not query_cache.is_expired(cached_result):
        return cached_result["result"]
    
    # Process query
    result = await process_query(request.query, request.filters)
    
    # Cache result
    query_cache.set(request.query, request.filters, result)
    
    return result
```

#### Redis Caching (Optional)
```python
import redis
import json
from typing import Optional

class RedisCache:
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_client = redis.from_url(redis_url)
    
    async def get(self, key: str) -> Optional[dict]:
        try:
            cached_data = self.redis_client.get(key)
            if cached_data:
                return json.loads(cached_data)
        except Exception as e:
            logger.warning(f"Redis get error: {e}")
        return None
    
    async def set(self, key: str, value: dict, ttl: int = 300):
        try:
            self.redis_client.setex(key, ttl, json.dumps(value))
        except Exception as e:
            logger.warning(f"Redis set error: {e}")
```

### Request Optimization

#### Async Processing
```python
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Process multiple documents concurrently
async def process_documents_batch(documents: List[str]) -> List[dict]:
    semaphore = asyncio.Semaphore(5)  # Limit concurrent processing
    
    async def process_single_document(doc: str) -> dict:
        async with semaphore:
            return await process_document(doc)
    
    tasks = [process_single_document(doc) for doc in documents]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Filter out exceptions
    return [result for result in results if not isinstance(result, Exception)]

# Background task processing
from fastapi import BackgroundTasks

@app.post("/upload-batch")
async def upload_documents_batch(
    files: List[UploadFile],
    background_tasks: BackgroundTasks
):
    # Return immediately with task ID
    task_id = generate_task_id()
    
    # Process in background
    background_tasks.add_task(process_documents_batch, files, task_id)
    
    return {"task_id": task_id, "status": "processing"}
```

#### Request Validation and Sanitization
```python
from pydantic import BaseModel, validator
from typing import Optional, List

class QueryRequest(BaseModel):
    query: str
    limit: Optional[int] = 10
    filters: Optional[dict] = {}
    
    @validator('query')
    def validate_query(cls, v):
        if len(v.strip()) < 3:
            raise ValueError('Query must be at least 3 characters long')
        if len(v) > 1000:
            raise ValueError('Query too long (max 1000 characters)')
        return v.strip()
    
    @validator('limit')
    def validate_limit(cls, v):
        if v is not None and (v < 1 or v > 100):
            raise ValueError('Limit must be between 1 and 100')
        return v
```

## Frontend Performance

### Bundle Optimization

#### Vite Configuration
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          utils: ['date-fns', 'clsx', 'tailwind-merge']
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  },
  server: {
    port: 3000,
    host: true
  }
})
```

#### Code Splitting
```typescript
// Lazy load components
import { lazy, Suspense } from 'react'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const DocumentUpload = lazy(() => import('./components/DocumentUpload'))
const ChatInterface = lazy(() => import('./components/ChatInterface'))

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<DocumentUpload />} />
        <Route path="/chat" element={<ChatInterface />} />
      </Routes>
    </Suspense>
  )
}
```

### React Performance Optimization

#### Memoization
```typescript
import { memo, useMemo, useCallback } from 'react'

// Memoize expensive components
const DocumentList = memo(({ documents, onSelect }) => {
  const sortedDocuments = useMemo(() => {
    return documents.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [documents])

  const handleSelect = useCallback((doc) => {
    onSelect(doc.id)
  }, [onSelect])

  return (
    <div>
      {sortedDocuments.map(doc => (
        <DocumentItem 
          key={doc.id} 
          document={doc} 
          onSelect={handleSelect}
        />
      ))}
    </div>
  )
})

// Optimize re-renders with React.memo
const DocumentItem = memo(({ document, onSelect }) => {
  return (
    <div onClick={() => onSelect(document)}>
      {document.title}
    </div>
  )
})
```

#### Virtual Scrolling
```typescript
import { FixedSizeList as List } from 'react-window'

const VirtualizedDocumentList = ({ documents }) => {
  const Row = ({ index, style }) => (
    <div style={style}>
      <DocumentItem document={documents[index]} />
    </div>
  )

  return (
    <List
      height={600}
      itemCount={documents.length}
      itemSize={80}
      width="100%"
    >
      {Row}
    </List>
  )
}
```

### API Client Optimization

#### Request Deduplication
```typescript
class APIClient {
  private pendingRequests = new Map<string, Promise<any>>()

  async request(url: string, options: RequestInit = {}) {
    const key = `${options.method || 'GET'}:${url}:${JSON.stringify(options.body)}`
    
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)
    }

    const promise = fetch(url, options)
      .then(response => response.json())
      .finally(() => {
        this.pendingRequests.delete(key)
      })

    this.pendingRequests.set(key, promise)
    return promise
  }
}
```

#### Request Batching
```typescript
class BatchedAPIClient {
  private batchQueue: Array<{
    query: string
    resolve: (result: any) => void
    reject: (error: any) => void
  }> = []
  private batchTimeout: NodeJS.Timeout | null = null

  async query(query: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({ query, resolve, reject })
      
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout)
      }
      
      this.batchTimeout = setTimeout(() => {
        this.processBatch()
      }, 50) // Batch requests for 50ms
    })
  }

  private async processBatch() {
    if (this.batchQueue.length === 0) return

    const batch = [...this.batchQueue]
    this.batchQueue = []
    this.batchTimeout = null

    try {
      const queries = batch.map(item => item.query)
      const results = await this.sendBatchRequest(queries)
      
      batch.forEach((item, index) => {
        item.resolve(results[index])
      })
    } catch (error) {
      batch.forEach(item => {
        item.reject(error)
      })
    }
  }
}
```

## Vector Database Optimization

### Qdrant Performance Tuning

#### Configuration Optimization
```yaml
# qdrant-config.yaml
service:
  http_port: 6333
  grpc_port: 6334
  host: 0.0.0.0

storage:
  storage_path: /qdrant/storage
  snapshots_path: /qdrant/snapshots
  
  # Performance optimizations
  wal_capacity_mb: 32
  wal_segments_ahead: 0
  
  # Memory optimization
  memmap_threshold_kb: 65536
  indexing_threshold_kb: 20000

cluster:
  enabled: false

# Collection configuration for optimal performance
collection_config:
  vectors:
    size: 1536  # For OpenAI embeddings
    distance: Cosine
  
  # Optimize for search performance
  hnsw_config:
    m: 16
    ef_construct: 100
    full_scan_threshold: 10000
  
  # Optimize for memory usage
  quantization_config:
    scalar:
      type: int8
      quantile: 0.99
      always_ram: true
```

#### Indexing Strategy
```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, OptimizersConfig

async def create_optimized_collection(client: QdrantClient, collection_name: str):
    await client.create_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(
            size=1536,
            distance=Distance.COSINE
        ),
        optimizers_config=OptimizersConfig(
            deleted_threshold=0.2,
            vacuum_min_vector_number=1000,
            default_segment_number=0,
            max_segment_size_kb=None,
            memmap_threshold_kb=None,
            indexing_threshold_kb=20000,
            flush_interval_sec=5,
            max_optimization_threads=1
        ),
        hnsw_config={
            "m": 16,
            "ef_construct": 100,
            "full_scan_threshold": 10000,
            "max_indexing_threads": 0,
            "on_disk": False
        }
    )
```

#### Batch Operations
```python
async def batch_upsert_vectors(
    client: QdrantClient,
    collection_name: str,
    vectors: List[dict],
    batch_size: int = 100
):
    """Efficiently upsert vectors in batches"""
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i + batch_size]
        
        points = [
            {
                "id": vector["id"],
                "vector": vector["embedding"],
                "payload": vector["metadata"]
            }
            for vector in batch
        ]
        
        await client.upsert(
            collection_name=collection_name,
            points=points,
            wait=False  # Don't wait for indexing
        )
    
    # Wait for all operations to complete
    await client.create_snapshot(collection_name)
```

### Embedding Optimization

#### Caching Strategy
```python
import hashlib
from typing import Dict, List, Optional

class EmbeddingCache:
    def __init__(self, max_size: int = 10000):
        self.cache: Dict[str, List[float]] = {}
        self.max_size = max_size
    
    def _get_cache_key(self, text: str) -> str:
        return hashlib.md5(text.encode()).hexdigest()
    
    def get(self, text: str) -> Optional[List[float]]:
        key = self._get_cache_key(text)
        return self.cache.get(key)
    
    def set(self, text: str, embedding: List[float]):
        if len(self.cache) >= self.max_size:
            # Remove oldest entry (simple FIFO)
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]
        
        key = self._get_cache_key(text)
        self.cache[key] = embedding

# Usage in embedding service
embedding_cache = EmbeddingCache()

async def get_embeddings_with_cache(texts: List[str]) -> List[List[float]]:
    embeddings = []
    texts_to_embed = []
    cache_indices = []
    
    # Check cache first
    for i, text in enumerate(texts):
        cached_embedding = embedding_cache.get(text)
        if cached_embedding:
            embeddings.append(cached_embedding)
        else:
            embeddings.append(None)
            texts_to_embed.append(text)
            cache_indices.append(i)
    
    # Generate embeddings for uncached texts
    if texts_to_embed:
        new_embeddings = await generate_embeddings(texts_to_embed)
        
        # Update cache and results
        for i, embedding in enumerate(new_embeddings):
            cache_index = cache_indices[i]
            embeddings[cache_index] = embedding
            embedding_cache.set(texts_to_embed[i], embedding)
    
    return embeddings
```

## LLM Service Optimization

### Google Gemini API Optimization

#### Request Batching
```python
import asyncio
from typing import List, Dict, Any

class GeminiAPIOptimizer:
    def __init__(self, api_key: str, max_concurrent: int = 5):
        self.api_key = api_key
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.request_queue = []
    
    async def generate_response_batch(
        self, 
        prompts: List[str],
        **kwargs
    ) -> List[str]:
        """Process multiple prompts concurrently with rate limiting"""
        
        async def process_single_prompt(prompt: str) -> str:
            async with self.semaphore:
                return await self.generate_response(prompt, **kwargs)
        
        tasks = [process_single_prompt(prompt) for prompt in prompts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle exceptions
        processed_results = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Gemini API error: {result}")
                processed_results.append("Error processing request")
            else:
                processed_results.append(result)
        
        return processed_results
    
    async def generate_response(self, prompt: str, **kwargs) -> str:
        """Single request with retry logic"""
        max_retries = 3
        base_delay = 1
        
        for attempt in range(max_retries):
            try:
                response = await self._make_api_request(prompt, **kwargs)
                return response
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                
                delay = base_delay * (2 ** attempt)
                await asyncio.sleep(delay)
        
        raise Exception("Max retries exceeded")
```

#### Response Caching
```python
class LLMResponseCache:
    def __init__(self, ttl: int = 3600):  # 1 hour TTL
        self.cache = {}
        self.ttl = ttl
    
    def _get_cache_key(self, prompt: str, **kwargs) -> str:
        cache_data = {"prompt": prompt, **kwargs}
        return hashlib.md5(json.dumps(cache_data, sort_keys=True).encode()).hexdigest()
    
    def get(self, prompt: str, **kwargs) -> Optional[str]:
        key = self._get_cache_key(prompt, **kwargs)
        entry = self.cache.get(key)
        
        if entry and time.time() - entry["timestamp"] < self.ttl:
            return entry["response"]
        
        # Remove expired entry
        if entry:
            del self.cache[key]
        
        return None
    
    def set(self, prompt: str, response: str, **kwargs):
        key = self._get_cache_key(prompt, **kwargs)
        self.cache[key] = {
            "response": response,
            "timestamp": time.time()
        }
```

## Scaling Strategies

### Horizontal Scaling

#### Load Balancing Configuration
```yaml
# nginx.conf for load balancing
upstream backend_servers {
    least_conn;
    server backend1:8000 weight=1 max_fails=3 fail_timeout=30s;
    server backend2:8000 weight=1 max_fails=3 fail_timeout=30s;
    server backend3:8000 weight=1 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    
    location /api/ {
        proxy_pass http://backend_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Health check
        proxy_next_upstream error timeout invalid_header http_500 http_502 http_503;
        proxy_connect_timeout 5s;
        proxy_send_timeout 10s;
        proxy_read_timeout 30s;
    }
}
```

#### Database Scaling
```python
# Read/Write splitting for PostgreSQL
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

class DatabaseManager:
    def __init__(self, write_url: str, read_urls: List[str]):
        self.write_engine = create_engine(write_url)
        self.read_engines = [create_engine(url) for url in read_urls]
        self.current_read_index = 0
    
    def get_write_session(self):
        Session = sessionmaker(bind=self.write_engine)
        return Session()
    
    def get_read_session(self):
        # Round-robin read replicas
        engine = self.read_engines[self.current_read_index]
        self.current_read_index = (self.current_read_index + 1) % len(self.read_engines)
        
        Session = sessionmaker(bind=engine)
        return Session()
```

### Vertical Scaling

#### Resource Allocation Guidelines
```yaml
# Kubernetes resource allocation
apiVersion: apps/v1
kind: Deployment
metadata:
  name: knowledge-assistant-backend
spec:
  replicas: 3
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
        env:
        - name: WORKERS
          value: "2"  # 2 workers per container
        - name: MAX_CONNECTIONS
          value: "100"
```

### Auto-Scaling Configuration

#### Platform-Specific Auto-Scaling

**Google Cloud Run:**
```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: knowledge-assistant-backend
  annotations:
    run.googleapis.com/execution-environment: gen2
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "100"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      containers:
      - image: gcr.io/project/knowledge-assistant-backend
        resources:
          limits:
            cpu: "1000m"
            memory: "1Gi"
```

**Fly.io Auto-Scaling:**
```toml
# fly.toml
[http_service]
  internal_port = 8000
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

[metrics]
  port = 9091
  path = "/metrics"
```

## Platform-Specific Optimizations

### Railway Optimizations

#### Memory Management
```python
# Optimize for Railway's 512MB limit
import gc
import psutil

class MemoryManager:
    def __init__(self, threshold_percent: float = 80):
        self.threshold_percent = threshold_percent
    
    def check_memory_usage(self):
        memory_percent = psutil.virtual_memory().percent
        if memory_percent > self.threshold_percent:
            self.cleanup_memory()
    
    def cleanup_memory(self):
        # Clear caches
        if hasattr(self, 'query_cache'):
            self.query_cache.clear()
        if hasattr(self, 'embedding_cache'):
            self.embedding_cache.clear()
        
        # Force garbage collection
        gc.collect()
        
        logger.info(f"Memory cleanup completed. Usage: {psutil.virtual_memory().percent}%")

# Use in API endpoints
memory_manager = MemoryManager()

@app.middleware("http")
async def memory_check_middleware(request: Request, call_next):
    memory_manager.check_memory_usage()
    response = await call_next(request)
    return response
```

### Fly.io Optimizations

#### Multi-Region Deployment
```bash
# Deploy to multiple regions
flyctl regions add lax sea fra

# Check current regions
flyctl regions list

# Configure region-specific scaling
flyctl scale count 2 --region ord
flyctl scale count 1 --region lax
flyctl scale count 1 --region sea
```

### Google Cloud Run Optimizations

#### Cold Start Optimization
```python
# Minimize cold start time
import asyncio
from contextlib import asynccontextmanager

# Pre-initialize services
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await initialize_database()
    await initialize_qdrant_client()
    await warm_up_gemini_api()
    
    yield
    
    # Shutdown
    await cleanup_resources()

app = FastAPI(lifespan=lifespan)

async def warm_up_gemini_api():
    """Warm up Gemini API with a simple request"""
    try:
        await generate_response("Hello", max_tokens=1)
    except Exception:
        pass  # Ignore warm-up failures
```

## Cost Optimization

### Resource Usage Monitoring

#### Cost Tracking Script
```bash
#!/bin/bash
# cost-monitor.sh

echo "📊 Resource Usage Report - $(date)"
echo "=================================="

# Memory usage
echo "💾 Memory Usage:"
free -h | grep -E "(Mem|Swap)"

# Disk usage
echo -e "\n💽 Disk Usage:"
df -h | grep -E "(Filesystem|/dev/)"

# Docker resource usage
echo -e "\n🐳 Container Resource Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"

# Database size
echo -e "\n🗄️ Database Size:"
if [ -f "data/knowledge_assistant.db" ]; then
    du -sh data/knowledge_assistant.db
fi

# Log file sizes
echo -e "\n📝 Log File Sizes:"
find logs/ -name "*.log" -exec du -sh {} \; 2>/dev/null | sort -hr

echo -e "\n✅ Report complete"
```

### Cost-Effective Architecture Patterns

#### Serverless-First Approach
```python
# Design for serverless with minimal cold start
class ServerlessOptimizedApp:
    def __init__(self):
        self.db_connection = None
        self.qdrant_client = None
        self.llm_client = None
    
    async def get_db_connection(self):
        if not self.db_connection:
            self.db_connection = await create_database_connection()
        return self.db_connection
    
    async def get_qdrant_client(self):
        if not self.qdrant_client:
            self.qdrant_client = await create_qdrant_client()
        return self.qdrant_client
    
    async def process_request(self, request):
        # Lazy initialization
        db = await self.get_db_connection()
        qdrant = await self.get_qdrant_client()
        
        # Process request
        return await handle_request(request, db, qdrant)

# Global instance for serverless
app_instance = ServerlessOptimizedApp()
```

This comprehensive performance optimization guide provides strategies for maximizing the efficiency and scalability of the Knowledge Assistant RAG application across all deployment platforms while maintaining cost-effectiveness.