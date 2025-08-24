import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertCircle, CheckCircle, Server, Database, Brain, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ConnectionMonitor, HealthCheckResponse } from '@/lib/errorHandling';

interface ConnectionStatusProps {
  showWhenOnline?: boolean;
  className?: string;
  showServiceDetails?: boolean;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ 
  showWhenOnline = false, 
  className = "",
  showServiceDetails = true
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [serviceHealth, setServiceHealth] = useState<HealthCheckResponse | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const monitor = ConnectionMonitor.getInstance();
    
    // Listen for connection changes
    const unsubscribeConnection = monitor.addListener((online) => {
      setIsOnline(online);
      if (online) {
        setServerStatus(monitor.getServerStatus());
      } else {
        setServerStatus('offline');
        setServiceHealth(null);
      }
    });

    // Listen for health status changes
    const unsubscribeHealth = monitor.addHealthListener((health) => {
      setServiceHealth(health);
      if (health) {
        setServerStatus(health.status === 'ok' ? 'online' : 'offline');
      }
    });

    // Set initial state
    setIsOnline(monitor.getStatus());
    setServerStatus(monitor.getServerStatus());
    setServiceHealth(monitor.getServiceHealth());

    return () => {
      unsubscribeConnection();
      unsubscribeHealth();
    };
  }, []);

  const handleRetryConnection = async () => {
    setIsRetrying(true);
    const monitor = ConnectionMonitor.getInstance();
    await monitor.forceHealthCheck();
    setIsRetrying(false);
  };

  const getServiceIcon = (serviceName: string) => {
    switch (serviceName) {
      case 'qdrant':
        return <Database className="h-3 w-3" />;
      case 'ollama':
        return <Brain className="h-3 w-3" />;
      case 'embedding_model':
        return <Server className="h-3 w-3" />;
      default:
        return <Server className="h-3 w-3" />;
    }
  };

  const getServiceDisplayName = (serviceName: string) => {
    switch (serviceName) {
      case 'qdrant':
        return 'Vector Database';
      case 'ollama':
        return 'Language Model';
      case 'embedding_model':
        return 'Embedding Model';
      default:
        return serviceName;
    }
  };

  const getServiceStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">Healthy</Badge>;
      case 'unhealthy':
        return <Badge variant="destructive">Unhealthy</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  // Don't show anything if online and showWhenOnline is false
  if (isOnline && serverStatus === 'online' && !showWhenOnline) {
    return null;
  }

  // Compact corner indicator mode when showServiceDetails is false
  if (!showServiceDetails) {
    const getCompactStatus = () => {
      if (!isOnline) {
        return { icon: <WifiOff className="h-3 w-3" />, text: 'Offline', color: 'bg-red-500' };
      }
      if (serverStatus === 'offline') {
        return { icon: <AlertCircle className="h-3 w-3" />, text: 'Server Down', color: 'bg-red-500' };
      }
      if (serverStatus === 'checking') {
        return { icon: <RefreshCw className="h-3 w-3 animate-spin" />, text: 'Checking...', color: 'bg-yellow-500' };
      }
      
      const hasUnhealthyServices = serviceHealth?.services && 
        Object.values(serviceHealth.services).some(service => service?.status === 'unhealthy');
      
      if (hasUnhealthyServices) {
        return { icon: <AlertCircle className="h-3 w-3" />, text: 'Issues', color: 'bg-yellow-500' };
      }
      
      return { icon: <CheckCircle className="h-3 w-3" />, text: 'Online', color: 'bg-green-500' };
    };

    const compactStatus = getCompactStatus();
    
    return (
      <div className={`${className} flex items-center gap-2 px-3 py-2 bg-card/90 backdrop-blur-sm border border-border/50 rounded-full shadow-lg text-xs`}>
        <div className={`w-2 h-2 rounded-full ${compactStatus.color}`} />
        {compactStatus.icon}
        <span className="font-medium">{compactStatus.text}</span>
      </div>
    );
  }

  const getStatusInfo = () => {
    if (!isOnline) {
      return {
        icon: <WifiOff className="h-4 w-4" />,
        variant: 'destructive' as const,
        title: 'No Internet Connection',
        description: 'You are currently offline. Please check your internet connection.',
        showRetry: false,
      };
    }

    if (serverStatus === 'offline') {
      return {
        icon: <AlertCircle className="h-4 w-4" />,
        variant: 'destructive' as const,
        title: 'Server Unavailable',
        description: 'Cannot connect to the server. Some features may not work properly.',
        showRetry: true,
      };
    }

    if (serverStatus === 'checking') {
      return {
        icon: <Wifi className="h-4 w-4 animate-pulse" />,
        variant: 'default' as const,
        title: 'Checking Connection',
        description: 'Verifying server connection...',
        showRetry: false,
      };
    }

    // Check if any services are unhealthy
    const hasUnhealthyServices = serviceHealth?.services && 
      Object.values(serviceHealth.services).some(service => service?.status === 'unhealthy');

    if (hasUnhealthyServices) {
      return {
        icon: <AlertCircle className="h-4 w-4" />,
        variant: 'destructive' as const,
        title: 'Service Issues Detected',
        description: 'Some services are experiencing issues. Check details below.',
        showRetry: true,
      };
    }

    return {
      icon: <CheckCircle className="h-4 w-4" />,
      variant: 'default' as const,
      title: 'All Systems Operational',
      description: serviceHealth ? `Response time: ${serviceHealth.services.qdrant?.responseTime || 0}ms` : 'Connected to server.',
      showRetry: false,
    };
  };

  const statusInfo = getStatusInfo();

  return (
    <Alert variant={statusInfo.variant} className={className}>
      {statusInfo.icon}
      <AlertDescription>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{statusInfo.title}</div>
              <div className="text-sm">{statusInfo.description}</div>
              {serviceHealth && (
                <div className="text-xs text-muted-foreground mt-1">
                  Last checked: {new Date(serviceHealth.timestamp).toLocaleTimeString()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {statusInfo.showRetry && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRetryConnection}
                  disabled={serverStatus === 'checking' || isRetrying}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${isRetrying ? 'animate-spin' : ''}`} />
                  {isRetrying ? 'Retrying...' : 'Retry'}
                </Button>
              )}
              {showServiceDetails && serviceHealth && (
                <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {isDetailsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
              )}
            </div>
          </div>

          {/* Service Details */}
          {showServiceDetails && serviceHealth && (
            <Collapsible open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
              <CollapsibleContent className="space-y-2">
                <div className="border-t border-border/50 pt-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Service Status</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {Object.entries(serviceHealth.services).map(([serviceName, service]) => (
                      <div key={serviceName} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                        <div className="flex items-center gap-2">
                          {getServiceIcon(serviceName)}
                          <span className="text-xs font-medium">{getServiceDisplayName(serviceName)}</span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {getServiceStatusBadge(service?.status || 'unknown')}
                          {service?.responseTime && (
                            <span className="text-xs text-muted-foreground">{service.responseTime}ms</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Show errors if any */}
                  {Object.entries(serviceHealth.services).some(([, service]) => service?.error) && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Service Errors</div>
                      {Object.entries(serviceHealth.services).map(([serviceName, service]) => 
                        service?.error && (
                          <div key={serviceName} className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">
                            <span className="font-medium">{getServiceDisplayName(serviceName)}:</span> {service.error}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default ConnectionStatus;