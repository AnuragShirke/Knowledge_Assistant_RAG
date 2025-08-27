import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Separator } from './ui/separator';
import { Progress } from './ui/progress';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  response_time_ms?: number;
  error_message?: string;
  metadata?: Record<string, any>;
  last_check?: string;
}

interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  disk_free_gb: number;
  uptime_seconds: number;
  timestamp: string;
}

interface Alert {
  type: string;
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
}

interface HealthStatus {
  status: string;
  timestamp: string;
  services: Record<string, ServiceHealth>;
  system_metrics: SystemMetrics;
  alerts: Alert[];
  summary: {
    total_services: number;
    healthy_services: number;
    degraded_services: number;
    unhealthy_services: number;
  };
}

const ServiceMonitor: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealthStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setHealthStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health status');
      console.error('Health check failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthStatus();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchHealthStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'unhealthy':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'default';
      case 'degraded':
        return 'secondary';
      case 'unhealthy':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getProgressColor = (percentage: number, warningThreshold: number, criticalThreshold: number) => {
    if (percentage >= criticalThreshold) return 'bg-red-500';
    if (percentage >= warningThreshold) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (loading && !healthStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading Service Status...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error && !healthStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Service Monitor Error</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={fetchHealthStatus} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Service Monitor</h2>
          <p className="text-muted-foreground">
            Last updated: {healthStatus?.timestamp ? new Date(healthStatus.timestamp).toLocaleString() : 'Never'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Disable Auto-refresh' : 'Enable Auto-refresh'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHealthStatus}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Overall Status */}
      {healthStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(healthStatus.status)}
              Overall System Status
              <Badge variant={getStatusBadgeVariant(healthStatus.status)}>
                {healthStatus.status.toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {healthStatus.summary.healthy_services}
                </div>
                <div className="text-sm text-muted-foreground">Healthy</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {healthStatus.summary.degraded_services}
                </div>
                <div className="text-sm text-muted-foreground">Degraded</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {healthStatus.summary.unhealthy_services}
                </div>
                <div className="text-sm text-muted-foreground">Unhealthy</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {healthStatus.summary.total_services}
                </div>
                <div className="text-sm text-muted-foreground">Total Services</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alerts */}
      {healthStatus?.alerts && healthStatus.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {healthStatus.alerts.map((alert, index) => (
              <Alert key={index} className={alert.severity === 'critical' ? 'border-red-500' : 'border-yellow-500'}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{alert.severity.toUpperCase()}:</strong> {alert.message}
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      {/* System Metrics */}
      {healthStatus?.system_metrics && (
        <Card>
          <CardHeader>
            <CardTitle>System Resources</CardTitle>
            <CardDescription>
              Uptime: {formatUptime(healthStatus.system_metrics.uptime_seconds)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>CPU Usage</span>
                <span>{healthStatus.system_metrics.cpu_percent.toFixed(1)}%</span>
              </div>
              <Progress 
                value={healthStatus.system_metrics.cpu_percent} 
                className="h-2"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Memory Usage</span>
                <span>{healthStatus.system_metrics.memory_percent.toFixed(1)}%</span>
              </div>
              <Progress 
                value={healthStatus.system_metrics.memory_percent} 
                className="h-2"
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Disk Usage</span>
                <span>
                  {healthStatus.system_metrics.disk_percent.toFixed(1)}% 
                  ({healthStatus.system_metrics.disk_free_gb.toFixed(1)} GB free)
                </span>
              </div>
              <Progress 
                value={healthStatus.system_metrics.disk_percent} 
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Service Details */}
      {healthStatus?.services && (
        <Card>
          <CardHeader>
            <CardTitle>Service Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(healthStatus.services).map(([serviceName, service]) => (
                <div key={serviceName} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(service.status)}
                      <h4 className="font-semibold capitalize">{serviceName.replace('_', ' ')}</h4>
                      <Badge variant={getStatusBadgeVariant(service.status)}>
                        {service.status}
                      </Badge>
                    </div>
                    {service.response_time_ms && (
                      <span className="text-sm text-muted-foreground">
                        {service.response_time_ms.toFixed(0)}ms
                      </span>
                    )}
                  </div>
                  
                  {service.error_message && (
                    <Alert className="mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>{service.error_message}</AlertDescription>
                    </Alert>
                  )}
                  
                  {service.metadata && (
                    <div className="text-sm text-muted-foreground">
                      {Object.entries(service.metadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="capitalize">{key.replace('_', ' ')}:</span>
                          <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {service.last_check && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Last checked: {new Date(service.last_check).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ServiceMonitor;