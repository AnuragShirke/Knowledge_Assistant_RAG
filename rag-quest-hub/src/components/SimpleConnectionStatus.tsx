import React, { useState, useEffect } from 'react';
import { SimpleHealthChecker } from '@/lib/errorHandling';

export const SimpleConnectionStatus: React.FC = () => {
  const [status, setStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  useEffect(() => {
    const checker = SimpleHealthChecker.getInstance();
    const unsubscribe = checker.addListener(setStatus);
    
    return unsubscribe;
  }, []);

  const handleRetry = async () => {
    const checker = SimpleHealthChecker.getInstance();
    await checker.forceCheck();
  };

  const getStatusColor = () => {
    switch (status) {
      case 'online': return '#10b981'; // green
      case 'offline': return '#ef4444'; // red
      case 'checking': return '#f59e0b'; // yellow
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'online': return 'Server Online';
      case 'offline': return 'Server Down';
      case 'checking': return 'Checking...';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.9)',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '6px',
      fontSize: '14px',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      border: `2px solid ${getStatusColor()}`
    }}>
      <div 
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: getStatusColor(),
          animation: status === 'checking' ? 'pulse 1.5s infinite' : 'none'
        }}
      />
      <span>{getStatusText()}</span>
      {status === 'offline' && (
        <button
          onClick={handleRetry}
          style={{
            marginLeft: '8px',
            padding: '4px 8px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          Retry
        </button>
      )}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};