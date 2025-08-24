import React from 'react';
import { Navigate } from 'react-router-dom';
import Header from '@/components/Header';
import DocumentUpload from '@/components/DocumentUpload';
import ChatInterface from '@/components/ChatInterface';
import ConnectionStatus from '@/components/ConnectionStatus';
import { useAuth } from '@/contexts/AuthContext';

const Dashboard: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-surface">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-surface">
      <Header />
      
      {/* Fixed Corner Status Indicator */}
      <ConnectionStatus 
        className="fixed top-20 right-4 z-50 max-w-xs" 
        showWhenOnline={true}
        showServiceDetails={false}
      />
      
      <div className="container mx-auto p-4 h-[calc(100vh-4rem)]">        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          {/* Left Column - Document Management */}
          <div className="lg:col-span-1 flex flex-col">
            <DocumentUpload />
          </div>

          {/* Right Column - Chat Interface */}
          <div className="lg:col-span-2 flex flex-col min-h-0">
            <div className="flex-1 bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg shadow-elegant flex flex-col min-h-0">
              <div className="p-4 border-b border-border/50 flex-shrink-0">
                <h2 className="text-lg font-semibold">Chat with your documents</h2>
                <p className="text-sm text-muted-foreground">
                  Ask questions about the content of your uploaded documents
                </p>
              </div>
              <div className="flex-1 min-h-0">
                <ChatInterface />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;