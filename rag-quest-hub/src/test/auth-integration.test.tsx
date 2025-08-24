/**
 * Integration tests for authentication flow with API interactions.
 * Tests the complete authentication flow including API calls and state management.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { authAPI } from '@/lib/api';
import { tokenStorage } from '@/lib/tokenStorage';
import { server } from './mocks/server';
import { http, HttpResponse } from 'msw';

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode; initialEntries?: string[] }> = ({ 
  children, 
  initialEntries = ['/'] 
}) => (
  <MemoryRouter initialEntries={initialEntries}>
    <AuthProvider>
      {children}
    </AuthProvider>
  </MemoryRouter>
);

// Mock toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('Authentication Integration Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('API Integration', () => {
    it('should successfully login and store token', async () => {
      const TestComponent = () => {
        const { login, isAuthenticated, user } = useAuth();
        
        const handleLogin = async () => {
          const success = await login({
            username: 'test@example.com',
            password: 'SecurePassword123!'
          });
          return success;
        };

        return (
          <div>
            <button onClick={handleLogin} data-testid="login-btn">Login</button>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
            <div data-testid="user">{user ? user.email : 'null'}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      const loginButton = screen.getByTestId('login-btn');
      
      await act(async () => {
        await userEvent.click(loginButton);
      });

      // Should be authenticated
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });

      // Token should be stored
      expect(tokenStorage.getToken()).toBeTruthy();
      expect(tokenStorage.hasValidToken()).toBe(true);
    });

    it('should handle login failure correctly', async () => {
      const TestComponent = () => {
        const { login, isAuthenticated } = useAuth();
        
        const handleLogin = async () => {
          const success = await login({
            username: 'test@example.com',
            password: 'wrongpassword'
          });
          return success;
        };

        return (
          <div>
            <button onClick={handleLogin} data-testid="login-btn">Login</button>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      const loginButton = screen.getByTestId('login-btn');
      
      await act(async () => {
        await userEvent.click(loginButton);
      });

      // Should remain unauthenticated
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      
      // No token should be stored
      expect(tokenStorage.getToken()).toBeNull();
    });

    it('should successfully register new user', async () => {
      const TestComponent = () => {
        const { register } = useAuth();
        const [success, setSuccess] = React.useState<boolean | null>(null);
        
        const handleRegister = async () => {
          const result = await register({
            email: 'newuser@example.com',
            password: 'SecurePassword123!',
            confirmPassword: 'SecurePassword123!'
          });
          setSuccess(result);
        };

        return (
          <div>
            <button onClick={handleRegister} data-testid="register-btn">Register</button>
            <div data-testid="success">{success?.toString() || 'null'}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      const registerButton = screen.getByTestId('register-btn');
      
      await act(async () => {
        await userEvent.click(registerButton);
      });

      // Should be successful
      await waitFor(() => {
        expect(screen.getByTestId('success')).toHaveTextContent('true');
      });
    });

    it('should handle registration failure for existing user', async () => {
      const TestComponent = () => {
        const { register } = useAuth();
        const [success, setSuccess] = React.useState<boolean | null>(null);
        
        const handleRegister = async () => {
          const result = await register({
            email: 'test@example.com', // Existing user
            password: 'SecurePassword123!',
            confirmPassword: 'SecurePassword123!'
          });
          setSuccess(result);
        };

        return (
          <div>
            <button onClick={handleRegister} data-testid="register-btn">Register</button>
            <div data-testid="success">{success?.toString() || 'null'}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      const registerButton = screen.getByTestId('register-btn');
      
      await act(async () => {
        await userEvent.click(registerButton);
      });

      // Should fail
      await waitFor(() => {
        expect(screen.getByTestId('success')).toHaveTextContent('false');
      });
    });

    it('should logout and clear token', async () => {
      // First login
      const TestComponent = () => {
        const { login, logout, isAuthenticated } = useAuth();
        
        const handleLogin = async () => {
          await login({
            username: 'test@example.com',
            password: 'SecurePassword123!'
          });
        };

        const handleLogout = async () => {
          await logout();
        };

        return (
          <div>
            <button onClick={handleLogin} data-testid="login-btn">Login</button>
            <button onClick={handleLogout} data-testid="logout-btn">Logout</button>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Login first
      const loginButton = screen.getByTestId('login-btn');
      await act(async () => {
        await userEvent.click(loginButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      });

      // Then logout
      const logoutButton = screen.getByTestId('logout-btn');
      await act(async () => {
        await userEvent.click(logoutButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      });

      // Token should be cleared
      expect(tokenStorage.getToken()).toBeNull();
    });
  });

  describe('Token Expiration Handling', () => {
    it('should handle expired token during API calls', async () => {
      // Set up expired token scenario
      server.use(
        http.get('http://localhost:8000/users/me', () => {
          return HttpResponse.json(
            {
              error: 'TokenExpiredError',
              detail: 'Token has expired',
              status_code: 401,
              timestamp: new Date().toISOString(),
              auth_required: true,
            },
            { status: 401 }
          );
        })
      );

      const TestComponent = () => {
        const { isAuthenticated, user } = useAuth();
        
        return (
          <div>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
            <div data-testid="user">{user ? user.email : 'null'}</div>
          </div>
        );
      };

      // Set an expired token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTYwMDAwMDAwMH0.mock-signature';
      tokenStorage.setToken(expiredToken);

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Should eventually clear the expired token and become unauthenticated
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
        expect(screen.getByTestId('user')).toHaveTextContent('null');
      });

      // Token should be cleared
      expect(tokenStorage.getToken()).toBeNull();
    });

    it('should handle invalid token format', async () => {
      // Set up invalid token scenario
      server.use(
        http.get('http://localhost:8000/users/me', () => {
          return HttpResponse.json(
            {
              error: 'InvalidTokenError',
              detail: 'Invalid token',
              status_code: 401,
              timestamp: new Date().toISOString(),
              auth_required: true,
            },
            { status: 401 }
          );
        })
      );

      const TestComponent = () => {
        const { isAuthenticated } = useAuth();
        
        return (
          <div>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
          </div>
        );
      };

      // Set an invalid token
      localStorage.setItem('access_token', 'invalid-token');
      localStorage.setItem('token_expiry', new Date(Date.now() + 3600000).toISOString());

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Should clear invalid token and become unauthenticated
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      });

      // Invalid token should be cleared
      expect(tokenStorage.getToken()).toBeNull();
    });
  });

  describe('Network Error Handling', () => {
    it('should handle network errors during login', async () => {
      // Mock network error
      server.use(
        http.post('http://localhost:8000/auth/jwt/login', () => {
          return HttpResponse.error();
        })
      );

      const TestComponent = () => {
        const { login, isAuthenticated } = useAuth();
        const [loginAttempted, setLoginAttempted] = React.useState(false);
        
        const handleLogin = async () => {
          setLoginAttempted(true);
          await login({
            username: 'test@example.com',
            password: 'SecurePassword123!'
          });
        };

        return (
          <div>
            <button onClick={handleLogin} data-testid="login-btn">Login</button>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
            <div data-testid="attempted">{loginAttempted.toString()}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      const loginButton = screen.getByTestId('login-btn');
      
      await act(async () => {
        await userEvent.click(loginButton);
      });

      // Should handle error gracefully
      await waitFor(() => {
        expect(screen.getByTestId('attempted')).toHaveTextContent('true');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      });
    });

    it('should handle network errors during registration', async () => {
      // Mock network error
      server.use(
        http.post('http://localhost:8000/auth/register', () => {
          return HttpResponse.error();
        })
      );

      const TestComponent = () => {
        const { register } = useAuth();
        const [success, setSuccess] = React.useState<boolean | null>(null);
        
        const handleRegister = async () => {
          const result = await register({
            email: 'newuser@example.com',
            password: 'SecurePassword123!',
            confirmPassword: 'SecurePassword123!'
          });
          setSuccess(result);
        };

        return (
          <div>
            <button onClick={handleRegister} data-testid="register-btn">Register</button>
            <div data-testid="success">{success?.toString() || 'null'}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      const registerButton = screen.getByTestId('register-btn');
      
      await act(async () => {
        await userEvent.click(registerButton);
      });

      // Should handle error gracefully
      await waitFor(() => {
        expect(screen.getByTestId('success')).toHaveTextContent('false');
      });
    });
  });

  describe('Concurrent Authentication Operations', () => {
    it('should handle multiple login attempts gracefully', async () => {
      const TestComponent = () => {
        const { login, isAuthenticated, loading } = useAuth();
        
        const handleMultipleLogins = async () => {
          // Trigger multiple login attempts
          const promises = [
            login({ username: 'test@example.com', password: 'SecurePassword123!' }),
            login({ username: 'test@example.com', password: 'SecurePassword123!' }),
            login({ username: 'test@example.com', password: 'SecurePassword123!' })
          ];
          
          await Promise.all(promises);
        };

        return (
          <div>
            <button onClick={handleMultipleLogins} data-testid="multi-login-btn">Multiple Login</button>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
            <div data-testid="loading">{loading.toString()}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      const multiLoginButton = screen.getByTestId('multi-login-btn');
      
      await act(async () => {
        await userEvent.click(multiLoginButton);
      });

      // Should handle multiple requests and end up authenticated
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });
    });
  });

  describe('Authentication State Persistence', () => {
    it('should maintain authentication across component remounts', async () => {
      const TestComponent = () => {
        const { login, isAuthenticated, user } = useAuth();
        
        const handleLogin = async () => {
          await login({
            username: 'test@example.com',
            password: 'SecurePassword123!'
          });
        };

        return (
          <div>
            <button onClick={handleLogin} data-testid="login-btn">Login</button>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
            <div data-testid="user">{user ? user.email : 'null'}</div>
          </div>
        );
      };

      const { rerender } = render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Login first
      const loginButton = screen.getByTestId('login-btn');
      await act(async () => {
        await userEvent.click(loginButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      });

      // Remount component
      rerender(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Should maintain authentication state
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });
    });
  });
});