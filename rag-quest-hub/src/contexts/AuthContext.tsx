import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, LoginCredentials } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { tokenStorage, setupStorageListener } from '@/lib/tokenStorage';
import { showAuthErrorToast, analyzeError } from '@/lib/errorHandling';

export interface User {
  id: string;
  email: string;
  is_active: boolean;
  is_verified: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  register: (userData: RegisterData) => Promise<boolean>;
  logout: () => Promise<void>;
  loading: boolean;
  tokenExpiresAt: Date | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}



export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<Date | null>(null);
  const { toast } = useToast();

  // Automatic logout when token expires
  const handleTokenExpiry = useCallback(() => {
    console.info('Token expired, logging out user');
    tokenStorage.clearToken();
    setUser(null);
    setIsAuthenticated(false);
    setTokenExpiresAt(null);
    toast({
      title: "Session Expired",
      description: "Your session has expired. Please log in again.",
      variant: "destructive",
      duration: 6000,
    });
  }, [toast]);

  // Handle cross-tab token changes
  const handleTokenChange = useCallback(() => {
    const token = tokenStorage.getToken();
    const expiry = tokenStorage.getTokenExpiry();

    if (token && expiry) {
      // Token is valid, update state if needed
      if (!isAuthenticated) {
        // Try to get user data
        authAPI.getCurrentUser()
          .then((userData) => {
            setUser(userData);
            setIsAuthenticated(true);
            setTokenExpiresAt(expiry);
          })
          .catch((error) => {
            // Token is invalid
            console.warn('Token validation failed during cross-tab sync:', error);
            tokenStorage.clearToken();
            setUser(null);
            setIsAuthenticated(false);
            setTokenExpiresAt(null);
          });
      }
    } else {
      // No valid token, clear state
      setUser(null);
      setIsAuthenticated(false);
      setTokenExpiresAt(null);
    }
  }, [isAuthenticated]);

  // Check token expiration periodically and handle cross-tab synchronization
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let cleanupStorageListener: (() => void) | undefined;

    if (isAuthenticated && tokenExpiresAt) {
      // Check token expiration every minute
      intervalId = setInterval(() => {
        if (!tokenStorage.hasValidToken()) {
          handleTokenExpiry();
        }
      }, 60000);
    }

    // Set up cross-tab synchronization
    cleanupStorageListener = setupStorageListener(handleTokenChange);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (cleanupStorageListener) {
        cleanupStorageListener();
      }
    };
  }, [isAuthenticated, tokenExpiresAt, handleTokenExpiry, handleTokenChange]);

  useEffect(() => {
    // Initialize authentication state on app startup
    const initializeAuth = async () => {
      const token = tokenStorage.getToken();
      const expiry = tokenStorage.getTokenExpiry();

      if (token && expiry) {
        try {
          // Try to get current user info to validate token
          const userData = await authAPI.getCurrentUser();

          setUser(userData);
          setIsAuthenticated(true);
          setTokenExpiresAt(expiry);
        } catch (error) {
          // Token is invalid, clear it
          console.warn('Token validation failed during initialization:', error);
          tokenStorage.clearToken();
          setUser(null);
          setIsAuthenticated(false);
          setTokenExpiresAt(null);
        }
      } else {
        // No valid token found
        setUser(null);
        setIsAuthenticated(false);
        setTokenExpiresAt(null);
      }

      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<boolean> => {
    try {
      setLoading(true);
      const response = await authAPI.login(credentials);

      // Store token using secure storage
      tokenStorage.setToken(response.access_token);
      const expirationDate = tokenStorage.getTokenExpiry();

      if (!expirationDate) {
        throw new Error('Invalid token received');
      }

      // Get user data after successful login
      const userData = await authAPI.getCurrentUser();
      setUser(userData);
      setIsAuthenticated(true);
      setTokenExpiresAt(expirationDate);

      toast({
        title: "Login successful",
        description: `Welcome back, ${userData.email}!`,
      });
      return true;
    } catch (error: any) {
      console.error('Login failed:', error);

      // Use enhanced error handling for authentication errors
      showAuthErrorToast(error, 'login');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData: RegisterData): Promise<boolean> => {
    try {
      setLoading(true);

      // Validate password confirmation
      if (userData.password !== userData.confirmPassword) {
        toast({
          title: "Registration failed",
          description: "Passwords do not match.",
          variant: "destructive",
        });
        return false;
      }

      await authAPI.register({
        email: userData.email,
        password: userData.password,
      });

      toast({
        title: "Registration successful",
        description: "Account created successfully! Please log in.",
      });
      return true;
    } catch (error: any) {
      console.error('Registration failed:', error);

      // Use enhanced error handling for registration errors
      showAuthErrorToast(error, 'register');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with logout even if API call fails
    } finally {
      tokenStorage.clearToken();
      setUser(null);
      setIsAuthenticated(false);
      setTokenExpiresAt(null);
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
    }
  };

  const value = {
    user,
    isAuthenticated,
    login,
    register,
    logout,
    loading,
    tokenExpiresAt,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};