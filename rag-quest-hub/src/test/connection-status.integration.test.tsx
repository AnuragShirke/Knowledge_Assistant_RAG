import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import React from 'react';
import ConnectionStatus from '@/components/ConnectionStatus';

// Mock the error handling module
vi.mock('@/lib/errorHandling', () => {
  const mockMonitor = {
    addListener: vi.fn(() => vi.fn()),
    addHealthListener: vi.fn(() => vi.fn()),
    getStatus: vi.fn(() => true),
    getServerStatus: vi.fn(() => 'online'),
    getServiceHealth: vi.fn(() => ({
      status: 'ok',
      timestamp: '2024-01-01T00:00:00Z',
      services: {
        qdrant: { status: 'healthy', collections_count: 1, responseTime: 50 },
        ollama: { status: 'healthy', model: 'llama3', responseTime: 100 },
        embedding_model: { status: 'healthy', embedding_dimension: 384, responseTime: 25 }
      }
    })),
    forceHealthCheck: vi.fn(),
  };

  return {
    ConnectionMonitor: {
      getInstance: vi.fn(() => mockMonitor),
    },
  };
});

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

// Mock UI components
vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, open }: any) => (
    <div data-testid="collapsible" style={{ display: open ? 'block' : 'none' }}>
      {children}
    </div>
  ),
  CollapsibleContent: ({ children }: any) => (
    <div data-testid="collapsible-content">{children}</div>
  ),
  CollapsibleTrigger: ({ children, asChild, ...props }: any) => 
    asChild ? React.cloneElement(children, props) : <button {...props}>{children}</button>,
}));

describe('ConnectionStatus Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render connection status when showWhenOnline is true', () => {
    render(<ConnectionStatus showWhenOnline={true} showServiceDetails={true} />);
    
    expect(screen.getByText('All Systems Operational')).toBeInTheDocument();
  });

  it('should show service details when expanded', async () => {
    const user = userEvent.setup();
    render(<ConnectionStatus showWhenOnline={true} showServiceDetails={true} />);
    
    // Find and click the expand button
    const expandButton = screen.getByRole('button');
    await user.click(expandButton);
    
    await waitFor(() => {
      expect(screen.getByText('Vector Database')).toBeInTheDocument();
      expect(screen.getByText('Language Model')).toBeInTheDocument();
      expect(screen.getByText('Embedding Model')).toBeInTheDocument();
    });
  });

  it('should handle offline state', () => {
    const { ConnectionMonitor } = require('@/lib/errorHandling');
    const mockMonitor = ConnectionMonitor.getInstance();
    mockMonitor.getStatus.mockReturnValue(false);
    mockMonitor.getServerStatus.mockReturnValue('offline');
    
    render(<ConnectionStatus showWhenOnline={true} />);
    
    expect(screen.getByText('No Internet Connection')).toBeInTheDocument();
  });

  it('should handle server unavailable state', () => {
    const { ConnectionMonitor } = require('@/lib/errorHandling');
    const mockMonitor = ConnectionMonitor.getInstance();
    mockMonitor.getStatus.mockReturnValue(true);
    mockMonitor.getServerStatus.mockReturnValue('offline');
    
    render(<ConnectionStatus showWhenOnline={true} />);
    
    expect(screen.getByText('Server Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('should handle degraded service state', () => {
    const { ConnectionMonitor } = require('@/lib/errorHandling');
    const mockMonitor = ConnectionMonitor.getInstance();
    mockMonitor.getServiceHealth.mockReturnValue({
      status: 'degraded',
      timestamp: '2024-01-01T00:00:00Z',
      services: {
        qdrant: { status: 'healthy', collections_count: 1 },
        ollama: { status: 'unhealthy', error: 'Connection timeout' },
        embedding_model: { status: 'healthy', embedding_dimension: 384 }
      }
    });
    
    render(<ConnectionStatus showWhenOnline={true} showServiceDetails={true} />);
    
    expect(screen.getByText('Service Issues Detected')).toBeInTheDocument();
  });

  it('should call forceHealthCheck when retry button is clicked', async () => {
    const user = userEvent.setup();
    const { ConnectionMonitor } = require('@/lib/errorHandling');
    const mockMonitor = ConnectionMonitor.getInstance();
    mockMonitor.getStatus.mockReturnValue(true);
    mockMonitor.getServerStatus.mockReturnValue('offline');
    
    render(<ConnectionStatus showWhenOnline={true} />);
    
    const retryButton = screen.getByText('Retry');
    await user.click(retryButton);
    
    expect(mockMonitor.forceHealthCheck).toHaveBeenCalled();
  });
});