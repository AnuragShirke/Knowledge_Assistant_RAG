// src/lib/errorHandling.ts
import { toast } from "@/hooks/use-toast";

interface ApiError {
  response?: {
    data?: {
      detail?: string | { msg: string }[];
    };
  };
}

export function analyzeError(error: ApiError): string {
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail) && detail[0]?.msg) {
      return detail[0].msg;
    }
  }
  return "An unknown error occurred.";
}

export function showAuthErrorToast(error: ApiError, type: 'login' | 'register') {
  const message = analyzeError(error);
  toast({
    title: `${type === 'login' ? 'Login' : 'Registration'} Failed`,
    description: message,
    variant: "destructive",
  });
}

export function showErrorToast(error: ApiError, title: string = "Error") {
  const message = analyzeError(error);
  toast({
    title: title,
    description: message,
    variant: "destructive",
  });
}

// You can add more complex error handling functions here if needed.
// For example, a function to create a retry mechanism.

export const createRetryFunction = (fn: () => Promise<any>, retries = 3, delay = 1000) => {
  return async (...args: any[]) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn(...args);
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(res => setTimeout(res, delay * (i + 1)));
      }
    }
  };
};

// Simple Health Checker Class
// This is the class that was causing issues earlier.
// We are recreating it as part of the lib folder restoration.
export class SimpleHealthChecker {
  private static instance: SimpleHealthChecker;
  private endpoint = (import.meta.env.VITE_API_BASE_URL || '') + '/health/simple';
  private status: 'online' | 'offline' | 'checking' = 'checking';
  private listeners: Set<(status: 'online' | 'offline' | 'checking') => void> = new Set();
  private intervalId: NodeJS.Timeout | null = null;

  private constructor() {
    this.startChecking();
  }

  public static getInstance(): SimpleHealthChecker {
    if (!SimpleHealthChecker.instance) {
      SimpleHealthChecker.instance = new SimpleHealthChecker();
    }
    return SimpleHealthChecker.instance;
  }

  private setStatus(newStatus: 'online' | 'offline' | 'checking') {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.listeners.forEach(listener => listener(this.status));
    }
  }

  public addListener(listener: (status: 'online' | 'offline' | 'checking') => void): () => void {
    this.listeners.add(listener);
    listener(this.status); // Immediately notify the new listener
    return () => this.listeners.delete(listener);
  }

  private async checkHealth() {
    this.setStatus('checking');
    try {
      const response = await fetch(this.endpoint);
      if (response.ok) {
        this.setStatus('online');
      } else {
        this.setStatus('offline');
      }
    } catch (error) {
      this.setStatus('offline');
    }
  }
  
  public async forceCheck() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    await this.checkHealth();
    this.startChecking();
  }

  private startChecking() {
    this.checkHealth(); // Initial check
    this.intervalId = setInterval(() => this.checkHealth(), 30000); // Check every 30 seconds
  }
}
