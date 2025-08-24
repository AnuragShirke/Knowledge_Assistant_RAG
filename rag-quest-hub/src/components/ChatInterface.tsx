import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Send, Bot, User, Loader2, FileText, ExternalLink, RefreshCw, AlertTriangle, WifiOff } from 'lucide-react';
import { queryAPI, QueryResponse } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { analyzeError, createRetryFunction, showErrorToast, ConnectionMonitor } from '@/lib/errorHandling';

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: Date;
  sources?: Array<{
    source: string;
    text: string;
    score: number;
  }>;
  isRetryable?: boolean;
  originalQuery?: string;
}

type QueryStatus = 'idle' | 'typing' | 'processing' | 'timeout' | 'error';

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [queryStatus, setQueryStatus] = useState<QueryStatus>('idle');
  const [typingDots, setTypingDots] = useState('');
  const [queryStartTime, setQueryStartTime] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [retryAttempts, setRetryAttempts] = useState<Map<string, number>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, queryStatus]);

  useEffect(() => {
    // Add welcome message
    const welcomeMessage: Message = {
      id: 'welcome',
      type: 'assistant',
      content: 'Hello! I\'m your Knowledge Assistant. Upload some documents and ask me questions about their content. I\'ll help you find the information you need.',
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);

    // Set up connection monitoring
    const monitor = ConnectionMonitor.getInstance();
    const unsubscribe = monitor.addListener(setIsOnline);

    return unsubscribe;
  }, []);

  // Typing animation effect
  useEffect(() => {
    if (queryStatus === 'typing' || queryStatus === 'processing') {
      typingIntervalRef.current = setInterval(() => {
        setTypingDots(prev => {
          if (prev === '...') return '';
          return prev + '.';
        });
      }, 500);
    } else {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      setTypingDots('');
    }

    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, [queryStatus]);

  const executeQuery = async (queryText: string): Promise<QueryResponse> => {
    return await queryAPI.ask(queryText, 60000); // 60 second timeout
  };

  const handleSubmit = async (e: React.FormEvent, retryQuery?: string) => {
    e.preventDefault();
    const queryText = retryQuery || input.trim();
    if (!queryText || queryStatus !== 'idle') return;

    // Check if we're online
    if (!isOnline) {
      toast({
        title: "No internet connection",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
      return;
    }

    const messageId = Date.now().toString();
    const userMessage: Message = {
      id: messageId,
      type: 'user',
      content: queryText,
      timestamp: new Date(),
    };

    // Only add user message if it's not a retry
    if (!retryQuery) {
      setMessages(prev => [...prev, userMessage]);
      setInput('');
    }
    
    setQueryStatus('typing');
    setQueryStartTime(Date.now());

    // Track retry attempts
    const currentAttempts = retryAttempts.get(queryText) || 0;
    setRetryAttempts(prev => new Map(prev).set(queryText, currentAttempts + 1));

    // Simulate brief typing delay for better UX
    setTimeout(async () => {
      setQueryStatus('processing');
      
      // Create retry function with exponential backoff
      const retryQuery = createRetryFunction(() => executeQuery(queryText), 2, 3000);
      
      try {
        const response = await retryQuery();
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: response.answer,
          timestamp: new Date(),
          sources: response.source_documents,
        };

        setMessages(prev => [...prev, assistantMessage]);
        setQueryStatus('idle');
        
        // Reset retry count on success
        setRetryAttempts(prev => {
          const newMap = new Map(prev);
          newMap.delete(queryText);
          return newMap;
        });
        
      } catch (error: unknown) {
        console.error('Query failed:', error);
        setQueryStatus('error');
        
        const errorInfo = analyzeError(error);
        
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'error',
          content: errorInfo.userMessage,
          timestamp: new Date(),
          isRetryable: errorInfo.canRetry && currentAttempts < 3,
          originalQuery: queryText,
        };

        setMessages(prev => [...prev, errorMessage]);
        
        // Show toast with specific error information
        showErrorToast(error, `Query failed: ${errorInfo.userMessage}`);
        
        // Reset status after a delay
        setTimeout(() => {
          setQueryStatus('idle');
        }, 1000);
      }
    }, 800); // Brief typing simulation
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleRetry = (originalQuery: string) => {
    const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
    handleSubmit(syntheticEvent, originalQuery);
  };

  const getLoadingMessage = () => {
    if (queryStatus === 'typing') {
      return `Thinking${typingDots}`;
    } else if (queryStatus === 'processing') {
      const elapsed = queryStartTime ? Math.floor((Date.now() - queryStartTime) / 1000) : 0;
      if (elapsed < 10) {
        return `Processing${typingDots}`;
      } else if (elapsed < 30) {
        return `Still working${typingDots} This might take a moment for complex queries.`;
      } else {
        return `Taking longer than usual${typingDots} Please be patient.`;
      }
    }
    return 'Thinking...';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scroll-smooth">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.type === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.type === 'assistant' && (
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center shadow-glow">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
              </div>
            )}
            
            <Card
              className={`max-w-[80%] p-4 ${
                message.type === 'user'
                  ? 'bg-primary text-primary-foreground shadow-glow'
                  : message.type === 'error'
                  ? 'bg-destructive/10 border-destructive/20 backdrop-blur-sm'
                  : 'bg-card/50 border-border/50 backdrop-blur-sm'
              }`}
            >
              {message.type === 'error' && (
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    Query Failed
                  </span>
                </div>
              )}
              
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </p>

              {message.type === 'error' && message.isRetryable && message.originalQuery && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <div className="flex items-center justify-between">
                    <Button
                      onClick={() => handleRetry(message.originalQuery!)}
                      disabled={queryStatus !== 'idle' || !isOnline}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry Query
                      {retryAttempts.get(message.originalQuery!) && 
                        ` (${retryAttempts.get(message.originalQuery!)})`}
                    </Button>
                    {!isOnline && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <WifiOff className="h-3 w-3" />
                        Offline
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Source Citations */}
              {message.type === 'assistant' && message.sources && message.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Sources ({message.sources.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {message.sources.map((source, index) => (
                      <div
                        key={index}
                        className="text-xs p-2 bg-muted/30 rounded border border-border/20"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground truncate">
                            {source.source}
                          </span>
                          <span className="text-muted-foreground ml-2">
                            {Math.round(source.score * 100)}% match
                          </span>
                        </div>
                        <p className="text-muted-foreground overflow-hidden" style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical'
                        }}>
                          {source.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <p
                className={`text-xs mt-2 ${
                  message.type === 'user'
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground'
                }`}
              >
                {message.timestamp.toLocaleTimeString()}
              </p>
            </Card>

            {message.type === 'user' && (
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-secondary-foreground" />
                </div>
              </div>
            )}
          </div>
        ))}

        {(queryStatus === 'typing' || queryStatus === 'processing') && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-gradient-primary rounded-full flex items-center justify-center shadow-glow">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
            </div>
            <Card className="p-4 bg-card/50 border-border/50 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  {getLoadingMessage()}
                </span>
              </div>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="border-t border-border/50 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              !isOnline ? "You're offline. Please check your connection." :
              queryStatus === 'idle' ? "Ask a question about your documents..." : 
              "Processing query..."
            }
            disabled={queryStatus !== 'idle' || !isOnline}
            className="flex-1 bg-input/50 border-border/50"
          />
          <Button
            type="submit"
            disabled={!input.trim() || queryStatus !== 'idle' || !isOnline}
            className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-glow transition-smooth"
          >
            {!isOnline ? (
              <WifiOff className="h-4 w-4" />
            ) : queryStatus === 'typing' || queryStatus === 'processing' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;