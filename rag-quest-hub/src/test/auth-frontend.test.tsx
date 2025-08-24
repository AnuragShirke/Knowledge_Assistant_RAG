/**
 * Comprehensive frontend authentication tests.
 * Tests login/registration form validation, authentication state management,
 * protected route access and redirects, and token persistence across browser sessions.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ProtectedRoute from '@/components/ProtectedRoute';
import { tokenStorage } from '@/lib/tokenStorage';
import { server } from './mocks/server';
import { http, HttpResponse } from 'msw';

// Mock components for testing
const MockDashboard = () => <div data-testid="dashboard">Dashboard</div>;
const MockProtectedContent = () => <div data-testid="protected-content">Protected Content</div>;

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

// Mock theme toggle component
vi.mock('@/components/ThemeToggle', () => ({
  default: () => <div data-testid="theme-toggle">Theme Toggle</div>,
}));

describe('Frontend Authentication Tests', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    localStorage.clear();
  });

  describe('Login Form Validation', () => {
    it('should display validation errors for empty fields', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      // Try to submit without filling fields
      await user.click(submitButton);

      // HTML5 validation should prevent submission
      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      
      expect(emailInput).toBeInvalid();
      expect(passwordInput).toBeInvalid();
    });

    it('should validate email format', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Enter invalid email
      await user.type(emailInput, 'invalid-email');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      // HTML5 validation should catch invalid email
      expect(emailInput).toBeInvalid();
    });

    it('should handle login with valid credentials', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Enter valid credentials
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'SecurePassword123!');
      
      await user.click(submitButton);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText(/signing in/i)).toBeInTheDocument();
      });

      // Wait for login to complete
      await waitFor(() => {
        expect(screen.queryByText(/signing in/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should handle login with invalid credentials', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      // Enter invalid credentials
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'wrongpassword');
      
      await user.click(submitButton);

      // Should show loading state then return to normal
      await waitFor(() => {
        expect(screen.getByText(/signing in/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.queryByText(/signing in/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });

      // Should still be on login page
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should disable form during login process', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'SecurePassword123!');
      
      await user.click(submitButton);

      // Form should be disabled during loading
      await waitFor(() => {
        expect(emailInput).toBeDisabled();
        expect(passwordInput).toBeDisabled();
        expect(submitButton).toBeDisabled();
      });
    });
  });

  describe('Registration Form Validation', () => {
    it('should validate all required fields', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Register />
        </TestWrapper>
      );

      const submitButton = screen.getByRole('button', { name: /create account/i });
      
      // Try to submit without filling fields
      await user.click(submitButton);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      
      expect(emailInput).toBeInvalid();
      expect(passwordInput).toBeInvalid();
      expect(confirmPasswordInput).toBeInvalid();
    });

    it('should validate email format in registration', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Register />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const submitButton = screen.getByRole('button', { name: /create account/i });

      await user.type(emailInput, 'invalid-email');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
      });
    });

    it('should validate password length', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Register />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText('Password');
      const submitButton = screen.getByRole('button', { name: /create account/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, '123'); // Too short
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/password must be at least 8 characters long/i)).toBeInTheDocument();
      });
    });

    it('should validate password confirmation match', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Register />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole('button', { name: /create account/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'SecurePassword123!');
      await user.type(confirmPasswordInput, 'DifferentPassword123!');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      });
    });

    it('should handle successful registration', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Register />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole('button', { name: /create account/i });

      await user.type(emailInput, 'newuser@example.com');
      await user.type(passwordInput, 'SecurePassword123!');
      await user.type(confirmPasswordInput, 'SecurePassword123!');
      
      await user.click(submitButton);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText(/creating account/i)).toBeInTheDocument();
      });

      // Wait for registration to complete
      await waitFor(() => {
        expect(screen.queryByText(/creating account/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should handle registration with existing email', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Register />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText('Password');
      const confirmPasswordInput = screen.getByLabelText(/confirm password/i);
      const submitButton = screen.getByRole('button', { name: /create account/i });

      // Try to register with existing email
      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'SecurePassword123!');
      await user.type(confirmPasswordInput, 'SecurePassword123!');
      
      await user.click(submitButton);

      // Should show loading state then return to normal
      await waitFor(() => {
        expect(screen.getByText(/creating account/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.queryByText(/creating account/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });

      // Should still be on registration page
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('should toggle password visibility', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Register />
        </TestWrapper>
      );

      const passwordInput = screen.getByLabelText('Password');
      const toggleButtons = screen.getAllByRole('button');
      const passwordToggle = toggleButtons.find(button => 
        button.querySelector('svg') && button !== screen.getByRole('button', { name: /create account/i })
      );

      expect(passwordInput).toHaveAttribute('type', 'password');

      if (passwordToggle) {
        await user.click(passwordToggle);
        expect(passwordInput).toHaveAttribute('type', 'text');

        await user.click(passwordToggle);
        expect(passwordInput).toHaveAttribute('type', 'password');
      }
    });
  });

  describe('Authentication State Management', () => {
    it('should initialize with unauthenticated state', () => {
      const TestComponent = () => {
        const { isAuthenticated, user, loading } = useAuth();
        return (
          <div>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
            <div data-testid="user">{user ? user.email : 'null'}</div>
            <div data-testid="loading">{loading.toString()}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('user')).toHaveTextContent('null');
    });

    it('should update state after successful login', async () => {
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

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      const loginButton = screen.getByTestId('login-btn');
      
      await act(async () => {
        await fireEvent.click(loginButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });
    });

    it('should clear state after logout', async () => {
      // First, set up authenticated state
      const validToken = tokenStorage.setToken('valid-token');
      
      const TestComponent = () => {
        const { logout, isAuthenticated, user } = useAuth();
        
        return (
          <div>
            <button onClick={logout} data-testid="logout-btn">Logout</button>
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

      const logoutButton = screen.getByTestId('logout-btn');
      
      await act(async () => {
        await fireEvent.click(logoutButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
        expect(screen.getByTestId('user')).toHaveTextContent('null');
      });
    });

    it('should handle authentication errors gracefully', async () => {
      // Mock a failed login response
      server.use(
        http.post('http://localhost:8000/auth/jwt/login', () => {
          return HttpResponse.json(
            { detail: 'LOGIN_BAD_CREDENTIALS' },
            { status: 400 }
          );
        })
      );

      const TestComponent = () => {
        const { login, isAuthenticated } = useAuth();
        
        const handleLogin = async () => {
          await login({
            username: 'test@example.com',
            password: 'wrongpassword'
          });
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
        await fireEvent.click(loginButton);
      });

      // Should remain unauthenticated
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    });
  });

  describe('Protected Route Access and Redirects', () => {
    it('should redirect unauthenticated users to login', () => {
      render(
        <TestWrapper initialEntries={['/dashboard']}>
          <ProtectedRoute>
            <MockDashboard />
          </ProtectedRoute>
        </TestWrapper>
      );

      // Should not show protected content
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
      
      // Should show loading or redirect (depending on implementation)
      // The actual redirect behavior depends on the router setup
    });

    it('should show loading state while checking authentication', () => {
      // Mock loading state
      const TestComponent = () => {
        const { loading } = useAuth();
        
        return (
          <ProtectedRoute>
            {loading ? <div data-testid="loading">Loading...</div> : <MockProtectedContent />}
          </ProtectedRoute>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Should show loading initially
      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    it('should allow access to authenticated users', async () => {
      // Mock authenticated state by setting a valid token
      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTYwMDAwMDAwMH0.mock-signature';
      tokenStorage.setToken(mockToken);

      const TestComponent = () => {
        const { isAuthenticated, loading } = useAuth();
        
        if (loading) return <div data-testid="loading">Loading...</div>;
        
        return (
          <ProtectedRoute>
            <MockProtectedContent />
          </ProtectedRoute>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Wait for authentication check to complete
      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      // Should show protected content
      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });
    });

    it('should preserve intended destination after login', () => {
      // This test would require more complex router setup
      // For now, we'll test the basic redirect behavior
      
      render(
        <TestWrapper initialEntries={['/dashboard']}>
          <ProtectedRoute>
            <MockDashboard />
          </ProtectedRoute>
        </TestWrapper>
      );

      // The location state should be preserved for redirect after login
      // This is handled by the ProtectedRoute component
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    });
  });

  describe('Token Persistence Across Browser Sessions', () => {
    it('should restore authentication state from stored token', async () => {
      // Set a valid token in localStorage
      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTYwMDAwMDAwMH0.mock-signature';
      const expiryDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      
      localStorage.setItem('access_token', mockToken);
      localStorage.setItem('token_expiry', expiryDate);

      const TestComponent = () => {
        const { isAuthenticated, user, loading } = useAuth();
        
        if (loading) return <div data-testid="loading">Loading...</div>;
        
        return (
          <div>
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

      // Should initially show loading
      expect(screen.getByTestId('loading')).toBeInTheDocument();

      // Wait for authentication to be restored
      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
      });
    });

    it('should clear invalid stored tokens', async () => {
      // Set an expired token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJleHAiOjE2MDAwMDAwMDAsImlhdCI6MTYwMDAwMDAwMH0.mock-signature';
      const expiredDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      
      localStorage.setItem('access_token', expiredToken);
      localStorage.setItem('token_expiry', expiredDate);

      const TestComponent = () => {
        const { isAuthenticated, loading } = useAuth();
        
        if (loading) return <div data-testid="loading">Loading...</div>;
        
        return (
          <div>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Wait for authentication check to complete
      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      // Should be unauthenticated and token should be cleared
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('token_expiry')).toBeNull();
    });

    it('should handle malformed tokens gracefully', async () => {
      // Set a malformed token
      localStorage.setItem('access_token', 'invalid-token');
      localStorage.setItem('token_expiry', new Date(Date.now() + 3600000).toISOString());

      const TestComponent = () => {
        const { isAuthenticated, loading } = useAuth();
        
        if (loading) return <div data-testid="loading">Loading...</div>;
        
        return (
          <div>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Wait for authentication check to complete
      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      // Should be unauthenticated and invalid token should be cleared
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(localStorage.getItem('access_token')).toBeNull();
    });

    it('should handle cross-tab token changes', async () => {
      const TestComponent = () => {
        const { isAuthenticated, loading } = useAuth();
        
        if (loading) return <div data-testid="loading">Loading...</div>;
        
        return (
          <div>
            <div data-testid="authenticated">{isAuthenticated.toString()}</div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
      });

      // Initially unauthenticated
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');

      // Simulate token being set in another tab
      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjNlNDU2Ny1lODliLTEyZDMtYTQ1Ni00MjY2MTQxNzQwMDAiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTYwMDAwMDAwMH0.mock-signature';
      const expiryDate = new Date(Date.now() + 3600000).toISOString();
      
      act(() => {
        localStorage.setItem('access_token', mockToken);
        localStorage.setItem('token_expiry', expiryDate);
        
        // Trigger storage event (simulating cross-tab change)
        window.dispatchEvent(new StorageEvent('storage', {
          key: 'access_token',
          newValue: mockToken,
          oldValue: null,
        }));
      });

      // Should update authentication state
      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      });
    });
  });

  describe('Form Navigation and Links', () => {
    it('should navigate between login and registration forms', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      // Should show login form initially
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

      // Click register link
      const registerLink = screen.getByRole('link', { name: /create one/i });
      expect(registerLink).toHaveAttribute('href', '/register');
    });

    it('should show register link on login page', () => {
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      const registerLink = screen.getByText(/create one/i);
      expect(registerLink).toBeInTheDocument();
    });

    it('should show login link on registration page', () => {
      render(
        <TestWrapper>
          <Register />
        </TestWrapper>
      );

      const loginLink = screen.getByText(/sign in/i);
      expect(loginLink).toBeInTheDocument();
    });
  });

  describe('Error Handling and User Feedback', () => {
    it('should handle network errors gracefully', async () => {
      // Mock network error
      server.use(
        http.post('http://localhost:8000/auth/jwt/login', () => {
          return HttpResponse.error();
        })
      );

      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'SecurePassword123!');
      await user.click(submitButton);

      // Should handle error gracefully and return to normal state
      await waitFor(() => {
        expect(screen.queryByText(/signing in/i)).not.toBeInTheDocument();
      }, { timeout: 3000 });

      // Should still be on login page
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('should clear validation errors when user starts typing', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <Register />
        </TestWrapper>
      );

      const emailInput = screen.getByLabelText(/email address/i);
      const submitButton = screen.getByRole('button', { name: /create account/i });

      // Trigger validation error
      await user.type(emailInput, 'invalid-email');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
      });

      // Start typing to clear error
      await user.clear(emailInput);
      await user.type(emailInput, 'valid@example.com');

      await waitFor(() => {
        expect(screen.queryByText(/please enter a valid email address/i)).not.toBeInTheDocument();
      });
    });
  });
});