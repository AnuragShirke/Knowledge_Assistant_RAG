import { http, HttpResponse } from 'msw';
import type { QueryResponse, UploadResponse, LoginResponse, User } from '../../lib/api';

// Mock user data
const mockUsers: Record<string, { id: string; email: string; password: string; is_active: boolean; is_verified: boolean }> = {
  'test@example.com': {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    password: 'SecurePassword123!',
    is_active: true,
    is_verified: false,
  },
  'inactive@example.com': {
    id: '123e4567-e89b-12d3-a456-426614174001',
    email: 'inactive@example.com',
    password: 'SecurePassword123!',
    is_active: false,
    is_verified: false,
  },
};

// Mock JWT token generation
const generateMockToken = (userId: string, expiresIn: number = 3600): string => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    iat: Math.floor(Date.now() / 1000),
  }));
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
};

export const handlers = [
  // Authentication endpoints
  http.post('http://localhost:8000/auth/register', async ({ request }) => {
    const body = await request.json() as { email: string; password: string };
    
    // Validate required fields
    if (!body.email || !body.password) {
      return HttpResponse.json(
        {
          error: 'ValidationError',
          detail: 'Email and password are required',
          status_code: 422,
          timestamp: new Date().toISOString(),
          validation_errors: [
            { field: !body.email ? 'email' : 'password', message: 'Field required' }
          ],
        },
        { status: 422 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return HttpResponse.json(
        {
          error: 'ValidationError',
          detail: 'Invalid email format',
          status_code: 422,
          timestamp: new Date().toISOString(),
          validation_errors: [
            { field: 'email', message: 'Invalid email format' }
          ],
        },
        { status: 422 }
      );
    }

    // Check if user already exists
    if (mockUsers[body.email]) {
      return HttpResponse.json(
        {
          error: 'UserAlreadyExistsError',
          detail: `User with email '${body.email}' already exists`,
          status_code: 409,
          timestamp: new Date().toISOString(),
          registration_error: true,
        },
        { status: 409 }
      );
    }

    // Create new user
    const newUser = {
      id: `new-user-${Date.now()}`,
      email: body.email,
      password: body.password,
      is_active: true,
      is_verified: false,
    };
    mockUsers[body.email] = newUser;

    const userResponse: User = {
      id: newUser.id,
      email: newUser.email,
      is_active: newUser.is_active,
      is_verified: newUser.is_verified,
    };

    return HttpResponse.json(userResponse, { status: 201 });
  }),

  http.post('http://localhost:8000/auth/jwt/login', async ({ request }) => {
    const formData = await request.formData();
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    // Validate required fields
    if (!username || !password) {
      return HttpResponse.json(
        {
          detail: 'LOGIN_BAD_CREDENTIALS',
          status_code: 400,
        },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = mockUsers[username];
    if (!user) {
      return HttpResponse.json(
        {
          detail: 'LOGIN_BAD_CREDENTIALS',
          status_code: 400,
        },
        { status: 400 }
      );
    }

    // Check password
    if (user.password !== password) {
      return HttpResponse.json(
        {
          detail: 'LOGIN_BAD_CREDENTIALS',
          status_code: 400,
        },
        { status: 400 }
      );
    }

    // Check if user is active
    if (!user.is_active) {
      return HttpResponse.json(
        {
          detail: 'LOGIN_BAD_CREDENTIALS',
          status_code: 400,
        },
        { status: 400 }
      );
    }

    // Generate token
    const token = generateMockToken(user.id);
    const response: LoginResponse = {
      access_token: token,
      token_type: 'bearer',
    };

    return HttpResponse.json(response);
  }),

  http.post('http://localhost:8000/auth/jwt/logout', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          error: 'AuthenticationError',
          detail: 'Authentication required',
          status_code: 401,
          timestamp: new Date().toISOString(),
          auth_required: true,
        },
        { status: 401 }
      );
    }

    return HttpResponse.json({ message: 'Successfully logged out' });
  }),

  http.get('http://localhost:8000/users/me', ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          error: 'AuthenticationError',
          detail: 'Authentication required',
          status_code: 401,
          timestamp: new Date().toISOString(),
          auth_required: true,
        },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Decode mock token to get user ID
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }
      
      const payload = JSON.parse(atob(parts[1]));
      
      // Check if token is expired
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
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
      }

      // Find user by ID
      const user = Object.values(mockUsers).find(u => u.id === payload.sub);
      if (!user) {
        return HttpResponse.json(
          {
            error: 'UserNotFoundError',
            detail: 'User not found',
            status_code: 401,
            timestamp: new Date().toISOString(),
            auth_required: true,
          },
          { status: 401 }
        );
      }

      // Check if user is still active
      if (!user.is_active) {
        return HttpResponse.json(
          {
            error: 'InactiveUserError',
            detail: 'User account is inactive',
            status_code: 401,
            timestamp: new Date().toISOString(),
            auth_required: true,
          },
          { status: 401 }
        );
      }

      const userResponse: User = {
        id: user.id,
        email: user.email,
        is_active: user.is_active,
        is_verified: user.is_verified,
      };

      return HttpResponse.json(userResponse);
    } catch (error) {
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
    }
  }),
  // Upload endpoint (requires authentication)
  http.post('http://localhost:8000/upload', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          error: 'AuthenticationError',
          detail: 'Authentication required',
          status_code: 401,
          timestamp: new Date().toISOString(),
          auth_required: true,
        },
        { status: 401 }
      );
    }
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return HttpResponse.json(
        {
          error: 'ValidationError',
          detail: 'No file provided',
          status_code: 422,
          timestamp: new Date().toISOString(),
        },
        { status: 422 }
      );
    }

    // Simulate file type validation
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    const supportedTypes = ['pdf', 'txt', 'docx'];
    
    if (!fileExtension || !supportedTypes.includes(fileExtension)) {
      return HttpResponse.json(
        {
          error: 'InvalidFileTypeError',
          detail: `Unsupported file type: .${fileExtension}. Supported types: ${supportedTypes.map(t => `.${t}`).join(', ')}`,
          status_code: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Simulate file size validation (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return HttpResponse.json(
        {
          error: 'FileProcessingError',
          detail: 'File size exceeds 10MB limit',
          status_code: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Simulate empty file check
    if (file.size === 0) {
      return HttpResponse.json(
        {
          error: 'EmptyFileError',
          detail: `File ${fileName} is empty or contains no extractable text`,
          status_code: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Simulate successful upload
    const response: UploadResponse = {
      filename: fileName,
      message: 'Successfully uploaded, processed, and stored.',
      num_chunks_stored: Math.floor(file.size / 1000) + 1, // Simulate chunk count
    };

    return HttpResponse.json(response);
  }),

  // Query endpoint (requires authentication)
  http.post('http://localhost:8000/query', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json(
        {
          error: 'AuthenticationError',
          detail: 'Authentication required',
          status_code: 401,
          timestamp: new Date().toISOString(),
          auth_required: true,
        },
        { status: 401 }
      );
    }
    const body = await request.json() as { query: string };
    
    if (!body.query || body.query.trim().length === 0) {
      return HttpResponse.json(
        {
          error: 'QueryValidationError',
          detail: 'Query cannot be empty',
          status_code: 400,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Simulate different query scenarios
    const query = body.query.toLowerCase();
    
    // Simulate no results found
    if (query.includes('nonexistent') || query.includes('empty')) {
      const response: QueryResponse = {
        answer: "I couldn't find any relevant information in the knowledge base to answer your question. Please try rephrasing your query or upload relevant documents first.",
        source_documents: [],
      };
      return HttpResponse.json(response);
    }

    // Simulate successful query with source documents
    const response: QueryResponse = {
      answer: `Based on the uploaded documents, here's what I found about "${body.query}": This is a comprehensive answer that addresses your question using the available knowledge base.`,
      source_documents: [
        {
          source: 'test-document.pdf',
          text: 'This is a relevant excerpt from the document that relates to your query...',
          score: 0.95,
        },
        {
          source: 'another-document.txt',
          text: 'Additional context from another document that supports the answer...',
          score: 0.87,
        },
      ],
    };

    return HttpResponse.json(response);
  }),

  // Health check endpoint
  http.get('http://localhost:8000/health', () => {
    return HttpResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        qdrant: { status: 'healthy', collections_count: 1 },
        ollama: { status: 'healthy', model: 'llama3' },
        embedding_model: { status: 'healthy', embedding_dimension: 384 },
      },
    });
  }),

  // Error simulation handlers
  http.post('http://localhost:8000/upload-server-error', () => {
    return HttpResponse.json(
      {
        error: 'InternalServerError',
        detail: 'An unexpected error occurred. Please try again later.',
        status_code: 500,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }),

  http.post('http://localhost:8000/query-timeout', () => {
    return new Promise(() => {
      // Never resolve to simulate timeout
    });
  }),

  http.post('http://localhost:8000/query-server-error', () => {
    return HttpResponse.json(
      {
        error: 'LLMError',
        detail: 'Failed to generate response: LLM service unavailable',
        status_code: 503,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }),
];