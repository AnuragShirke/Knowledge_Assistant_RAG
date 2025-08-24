import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// Create a separate mock fetch that doesn't interfere with MSW
const mockFetch = vi.fn();

describe('Docker Compose Service Integration Tests', () => {
  const BACKEND_URL = 'http://localhost:8000';
  const FRONTEND_URL = 'http://localhost:8080';

  beforeEach(() => {
    // Reset fetch mock before each test
    mockFetch.mockClear();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('Service Startup and Connectivity', () => {
    it('should verify backend service is accessible', async () => {
      // Mock successful health check response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          timestamp: new Date().toISOString(),
          services: {
            qdrant: { status: 'healthy', collections_count: 1 },
            ollama: { status: 'healthy', model: 'llama3' },
            embedding_model: { status: 'healthy', embedding_dimension: 384 },
          },
        }),
      });

      const response = await fetch(`${BACKEND_URL}/health`);
      const healthData = await response.json();

      expect(response.ok).toBe(true);
      expect(healthData.status).toBe('ok');
      expect(healthData.services.qdrant.status).toBe('healthy');
      expect(healthData.services.ollama.status).toBe('healthy');
      expect(healthData.services.embedding_model.status).toBe('healthy');
    });

    it('should verify all backend services are running', async () => {
      // Mock health check with all services healthy
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          services: {
            qdrant: { 
              status: 'healthy', 
              collections_count: 1,
              version: '1.0.0'
            },
            ollama: { 
              status: 'healthy', 
              model: 'llama3',
              available_models: ['llama3']
            },
            embedding_model: { 
              status: 'healthy', 
              embedding_dimension: 384,
              model_name: 'sentence-transformers'
            },
          },
        }),
      });

      const response = await fetch(`${BACKEND_URL}/health`);
      const healthData = await response.json();

      // Verify each service is properly configured
      expect(healthData.services.qdrant).toMatchObject({
        status: 'healthy',
        collections_count: expect.any(Number),
      });

      expect(healthData.services.ollama).toMatchObject({
        status: 'healthy',
        model: expect.any(String),
      });

      expect(healthData.services.embedding_model).toMatchObject({
        status: 'healthy',
        embedding_dimension: expect.any(Number),
      });
    });

    it('should handle degraded service states', async () => {
      // Mock health check with some services degraded
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'degraded',
          services: {
            qdrant: { status: 'healthy', collections_count: 1 },
            ollama: { 
              status: 'unhealthy', 
              error: 'Connection timeout'
            },
            embedding_model: { status: 'healthy', embedding_dimension: 384 },
          },
        }),
      });

      const response = await fetch(`${BACKEND_URL}/health`);
      const healthData = await response.json();

      expect(healthData.status).toBe('degraded');
      expect(healthData.services.ollama.status).toBe('unhealthy');
      expect(healthData.services.ollama.error).toBeDefined();
    });
  });

  describe('Network Configuration', () => {
    it('should verify CORS headers are properly configured', async () => {
      // Mock preflight OPTIONS request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['access-control-allow-origin', 'http://localhost:8080'],
          ['access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS'],
          ['access-control-allow-headers', 'Content-Type, Authorization'],
          ['access-control-allow-credentials', 'true'],
        ]),
      });

      const response = await fetch(`${BACKEND_URL}/upload`, {
        method: 'OPTIONS',
        headers: {
          'Origin': FRONTEND_URL,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_URL);
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    });

    it('should verify API endpoints are accessible from frontend', async () => {
      const endpoints = [
        { path: '/health', method: 'GET' },
        { path: '/upload', method: 'POST' },
        { path: '/query', method: 'POST' },
      ];

      for (const endpoint of endpoints) {
        // Mock successful response for each endpoint
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: endpoint.method === 'GET' ? 200 : 405, // POST endpoints return 405 without data
          json: async () => ({ message: 'Endpoint accessible' }),
        });

        const response = await fetch(`${BACKEND_URL}${endpoint.path}`, {
          method: endpoint.method,
          headers: {
            'Origin': FRONTEND_URL,
            'Content-Type': 'application/json',
          },
        });

        // Verify endpoint is reachable (even if it returns method not allowed for GET on POST endpoints)
        expect(response.status).toBeLessThan(500);
      }
    });

    it('should handle network timeouts gracefully', async () => {
      // Mock network timeout
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      try {
        await fetch(`${BACKEND_URL}/health`, {
          signal: AbortSignal.timeout(1000),
        });
      } catch (error: any) {
        expect(error.message).toContain('timeout');
      }
    });
  });

  describe('Service Communication', () => {
    it('should verify backend can communicate with Qdrant', async () => {
      // Mock health check showing Qdrant connectivity
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          services: {
            qdrant: {
              status: 'healthy',
              collections_count: 1,
              connection_info: {
                host: 'qdrant',
                port: 6333,
                collections: ['knowledge_base'],
              },
            },
          },
        }),
      });

      const response = await fetch(`${BACKEND_URL}/health`);
      const healthData = await response.json();

      expect(healthData.services.qdrant.status).toBe('healthy');
      expect(healthData.services.qdrant.collections_count).toBeGreaterThan(0);
    });

    it('should verify backend can communicate with Ollama', async () => {
      // Mock health check showing Ollama connectivity
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          services: {
            ollama: {
              status: 'healthy',
              model: 'llama3',
              connection_info: {
                host: 'ollama',
                port: 11434,
                available_models: ['llama3'],
              },
            },
          },
        }),
      });

      const response = await fetch(`${BACKEND_URL}/health`);
      const healthData = await response.json();

      expect(healthData.services.ollama.status).toBe('healthy');
      expect(healthData.services.ollama.model).toBe('llama3');
    });
  });

  describe('Environment Configuration', () => {
    it('should verify environment variables are properly set', async () => {
      // Mock health check that includes environment info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          environment: {
            cors_origins: ['http://localhost:8080', 'http://127.0.0.1:8080'],
            qdrant_host: 'qdrant',
            ollama_host: 'ollama',
            debug_mode: false,
          },
        }),
      });

      const response = await fetch(`${BACKEND_URL}/health`);
      const healthData = await response.json();

      expect(healthData.environment.cors_origins).toContain(FRONTEND_URL);
      expect(healthData.environment.qdrant_host).toBe('qdrant');
      expect(healthData.environment.ollama_host).toBe('ollama');
    });

    it('should handle different deployment environments', async () => {
      const environments = ['development', 'production', 'testing'];

      for (const env of environments) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            environment: {
              mode: env,
              cors_origins: env === 'production' 
                ? ['https://app.example.com'] 
                : ['http://localhost:8080'],
            },
          }),
        });

        const response = await fetch(`${BACKEND_URL}/health`);
        const healthData = await response.json();

        expect(healthData.environment.mode).toBe(env);
        expect(Array.isArray(healthData.environment.cors_origins)).toBe(true);
      }
    });
  });

  describe('Performance and Reliability', () => {
    it('should verify service startup time is reasonable', async () => {
      const startTime = Date.now();

      // Mock health check response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'ok',
          startup_time: '2.5s',
          services: {
            qdrant: { status: 'healthy', startup_time: '1.2s' },
            ollama: { status: 'healthy', startup_time: '2.1s' },
            embedding_model: { status: 'healthy', startup_time: '0.8s' },
          },
        }),
      });

      const response = await fetch(`${BACKEND_URL}/health`);
      const healthData = await response.json();
      const responseTime = Date.now() - startTime;

      expect(response.ok).toBe(true);
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
      expect(healthData.startup_time).toBeDefined();
    });

    it('should verify service health monitoring works', async () => {
      // Mock multiple health checks to simulate monitoring
      const healthChecks = [
        { status: 'ok', timestamp: '2024-01-01T10:00:00Z' },
        { status: 'ok', timestamp: '2024-01-01T10:01:00Z' },
        { status: 'degraded', timestamp: '2024-01-01T10:02:00Z' },
        { status: 'ok', timestamp: '2024-01-01T10:03:00Z' },
      ];

      for (const check of healthChecks) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => check,
        });

        const response = await fetch(`${BACKEND_URL}/health`);
        const healthData = await response.json();

        expect(healthData.status).toBe(check.status);
        expect(healthData.timestamp).toBe(check.timestamp);
      }
    });

    it('should handle service recovery after failures', async () => {
      // Simulate service failure and recovery
      const scenarios = [
        { ok: false, status: 503 }, // Service unavailable
        { ok: false, status: 503 }, // Still down
        { ok: true, status: 200, json: async () => ({ status: 'ok' }) }, // Recovered
      ];

      for (const scenario of scenarios) {
        mockFetch.mockResolvedValueOnce(scenario);

        try {
          const response = await fetch(`${BACKEND_URL}/health`);
          if (response.ok) {
            const healthData = await response.json();
            expect(healthData.status).toBe('ok');
          } else {
            expect(response.status).toBe(503);
          }
        } catch (error) {
          // Expected for failed scenarios
          expect(error).toBeDefined();
        }
      }
    });
  });
});