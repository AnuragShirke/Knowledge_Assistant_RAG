import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionMonitor, HealthCheckResponse } from '@/lib/errorHandling';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

describe('ConnectionMonitor Health Check', () => {
  let monitor: ConnectionMonitor;

  beforeEach(() => {
    // Reset singleton instance
    (ConnectionMonitor as any).instance = null;
    monitor = ConnectionMonitor.getInstance();
    vi.clearAllMocks();
  });

  afterEach(() => {
    monitor.destroy();
  });

  it('should perform health check and return service status', async () => {
    const mockHealthResponse: HealthCheckResponse = {
      status: 'ok',
      timestamp: '2024-01-01T00:00:00Z',
      services: {
        qdrant: {
          status: 'healthy',
          collections_count: 1,
        },
        ollama: {
          status: 'healthy',
          model: 'llama3',
        },
        embedding_model: {
          status: 'healthy',
          embedding_dimension: 384,
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHealthResponse),
    });

    const isHealthy = await monitor.checkServerConnection();
    expect(isHealthy).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('/api/health', {
      method: 'GET',
      cache: 'no-cache',
      signal: expect.any(AbortSignal),
    });
  });

  it('should handle health check failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const isHealthy = await monitor.checkServerConnection();
    expect(isHealthy).toBe(false);
  });

  it('should implement exponential backoff on connection failures', async () => {
    vi.useFakeTimers();
    
    // Mock failed responses for all attempts
    mockFetch
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockRejectedValueOnce(new Error('Connection failed'));

    // Start health check (this will trigger the initial attempt)
    const healthCheckPromise = monitor.forceHealthCheck();

    // Wait for initial attempt
    await vi.runOnlyPendingTimersAsync();
    
    // Fast-forward through retry attempts
    await vi.advanceTimersByTimeAsync(1000); // First retry after 1s
    await vi.runOnlyPendingTimersAsync();
    
    await vi.advanceTimersByTimeAsync(2000); // Second retry after 2s
    await vi.runOnlyPendingTimersAsync();
    
    await vi.advanceTimersByTimeAsync(4000); // Third retry after 4s
    await vi.runOnlyPendingTimersAsync();

    await healthCheckPromise;

    // Should have made multiple attempts with exponential backoff
    expect(mockFetch).toHaveBeenCalledTimes(4); // Initial + 3 retries

    vi.useRealTimers();
  });

  it('should notify health listeners when status changes', async () => {
    const healthListener = vi.fn();
    const unsubscribe = monitor.addHealthListener(healthListener);

    const mockHealthResponse: HealthCheckResponse = {
      status: 'degraded',
      timestamp: '2024-01-01T00:00:00Z',
      services: {
        qdrant: {
          status: 'healthy',
          collections_count: 1,
        },
        ollama: {
          status: 'unhealthy',
          error: 'Model not loaded',
        },
        embedding_model: {
          status: 'healthy',
          embedding_dimension: 384,
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHealthResponse),
    });

    await monitor.forceHealthCheck();

    // Should be called with the health response (after initial null call)
    expect(healthListener).toHaveBeenCalledWith(expect.objectContaining({
      status: 'degraded',
      services: expect.objectContaining({
        ollama: expect.objectContaining({
          status: 'unhealthy',
          error: 'Model not loaded'
        })
      })
    }));

    unsubscribe();
  });

  it('should handle degraded service status', async () => {
    const mockHealthResponse: HealthCheckResponse = {
      status: 'degraded',
      timestamp: '2024-01-01T00:00:00Z',
      services: {
        qdrant: {
          status: 'healthy',
          collections_count: 1,
        },
        ollama: {
          status: 'unhealthy',
          error: 'Connection timeout',
        },
        embedding_model: {
          status: 'healthy',
          embedding_dimension: 384,
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHealthResponse),
    });

    await monitor.forceHealthCheck();

    const serviceHealth = monitor.getServiceHealth();
    expect(serviceHealth?.status).toBe('degraded');
    expect(serviceHealth?.services.ollama?.status).toBe('unhealthy');
    expect(serviceHealth?.services.ollama?.error).toBe('Connection timeout');
  });

  it('should reset retry attempts on successful connection', async () => {
    vi.useFakeTimers();

    // First, simulate failures then success
    mockFetch
      .mockRejectedValueOnce(new Error('Failed'))
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'ok',
          timestamp: '2024-01-01T00:00:00Z',
          services: {},
        }),
      });

    // Start health check
    const healthCheckPromise = monitor.forceHealthCheck();

    // Fast-forward through retries
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(2000);
    await vi.runOnlyPendingTimersAsync();

    await healthCheckPromise;

    // Now force another health check - should succeed immediately
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        status: 'ok',
        timestamp: '2024-01-01T00:00:00Z',
        services: {},
      }),
    });

    await monitor.forceHealthCheck();

    // Should have reset retry attempts and be online
    expect(monitor.getServerStatus()).toBe('online');

    vi.useRealTimers();
  });
});