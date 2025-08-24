# Authentication Tests

This directory contains comprehensive tests for the Knowledge Assistant RAG application's authentication system.

## Overview

The authentication tests cover both backend and frontend components, ensuring that:

- User registration and login work correctly
- JWT tokens are properly validated and managed
- Protected endpoints require authentication
- Authentication state is properly managed across the application
- Token persistence works across browser sessions
- Error handling is robust and user-friendly

## Test Structure

### Backend Tests (`test_auth_backend.py`)

Located in `Knowledge_Assistant_RAG/tests/test_auth_backend.py`

**Test Classes:**
- `TestUserRegistration` - Tests user registration functionality
- `TestUserLogin` - Tests user login functionality  
- `TestJWTTokenValidation` - Tests JWT token validation and expiration
- `TestProtectedEndpointAccess` - Tests access control for protected endpoints
- `TestLogoutFunctionality` - Tests logout functionality
- `TestPasswordSecurity` - Tests password hashing and security
- `TestUserDataIsolation` - Tests user-specific data isolation

**Key Features Tested:**
- Valid/invalid user registration with proper validation
- Login with correct/incorrect credentials
- JWT token generation, validation, and expiration
- Protected endpoint access control (upload, query, users/me)
- Password hashing with bcrypt
- User-specific Qdrant collections
- Comprehensive error handling

### Frontend Tests

Located in `Knowledge_Assistant_RAG/rag-quest-hub/src/test/`

#### `auth-frontend.test.tsx`
Tests the React components and user interactions:

**Test Suites:**
- `Login Form Validation` - Tests login form validation and submission
- `Registration Form Validation` - Tests registration form validation
- `Authentication State Management` - Tests AuthContext state management
- `Protected Route Access and Redirects` - Tests ProtectedRoute component
- `Token Persistence Across Browser Sessions` - Tests localStorage persistence
- `Form Navigation and Links` - Tests navigation between forms
- `Error Handling and User Feedback` - Tests error display and handling

#### `auth-integration.test.tsx`
Tests the complete authentication flow with API integration:

**Test Suites:**
- `API Integration` - Tests actual API calls and responses
- `Token Expiration Handling` - Tests expired/invalid token scenarios
- `Network Error Handling` - Tests network failure scenarios
- `Concurrent Authentication Operations` - Tests multiple simultaneous requests
- `Authentication State Persistence` - Tests state across component remounts

## Requirements Coverage

The tests cover all requirements from the authentication system specification:

### Requirement 1.1, 1.2, 1.3 (User Registration and Login)
- ✅ Valid user registration with email/password
- ✅ Login with correct credentials returns JWT token
- ✅ Invalid credentials return authentication errors
- ✅ Logout invalidates session
- ✅ Duplicate registration returns conflict error

### Requirement 2.1, 2.2 (Data Privacy and Protection)
- ✅ Unauthenticated users cannot upload documents
- ✅ Unauthenticated users cannot query knowledge base
- ✅ Documents are associated with user ID
- ✅ Queries only search user's documents
- ✅ Expired tokens require re-authentication

### Requirement 3.1, 3.2, 3.3 (Security)
- ✅ Passwords are hashed with bcrypt
- ✅ JWT tokens use secure secret key
- ✅ Token signature and expiration validation
- ✅ No plain text password storage
- ✅ Token revocation support

### Requirement 4.1, 4.2, 4.3, 4.4 (User Interface)
- ✅ Login form for unauthenticated users
- ✅ Registration form available
- ✅ Redirect to dashboard after login
- ✅ Clear error messages displayed
- ✅ Redirect to dashboard if already logged in

### Requirement 5.1, 5.2, 5.3, 5.4 (Session Persistence)
- ✅ JWT token stored securely
- ✅ Authentication state maintained across browser refresh
- ✅ Automatic logout on token expiry
- ✅ Credentials cleared on logout
- ✅ Login state remembered until token expiry

## Running the Tests

### Prerequisites

**Backend Tests:**
```bash
pip install pytest pytest-asyncio httpx pytest-mock
```

**Frontend Tests:**
```bash
cd rag-quest-hub
npm install
```

### Running Individual Test Suites

**Backend Tests:**
```bash
# Run all backend authentication tests
python -m pytest tests/test_auth_backend.py -v

# Run specific test class
python -m pytest tests/test_auth_backend.py::TestUserRegistration -v

# Run specific test
python -m pytest tests/test_auth_backend.py::TestUserRegistration::test_register_valid_user -v
```

**Frontend Tests:**
```bash
cd rag-quest-hub

# Run all frontend authentication tests
npm run test -- --run src/test/auth-frontend.test.tsx src/test/auth-integration.test.tsx

# Run specific test file
npm run test -- --run src/test/auth-frontend.test.tsx

# Run with watch mode for development
npm run test src/test/auth-frontend.test.tsx
```

### Running All Authentication Tests

Use the provided script to run both backend and frontend tests:

```bash
./run-auth-tests.sh
```

This script will:
1. Install missing dependencies
2. Run backend authentication tests
3. Run frontend authentication tests
4. Provide a summary of results

## Test Configuration

### Backend Test Configuration

- **Database:** In-memory SQLite for isolation
- **External Services:** Mocked (Qdrant, Ollama, embedding model)
- **Authentication:** Real FastAPI-Users implementation
- **Test Framework:** pytest with asyncio support

### Frontend Test Configuration

- **Environment:** jsdom for DOM simulation
- **API Mocking:** MSW (Mock Service Worker)
- **Test Framework:** Vitest with React Testing Library
- **Authentication:** Real AuthContext implementation

## Mock Data and Scenarios

### Backend Mocks
- External services (Qdrant, Ollama, embedding model) are mocked
- Database uses in-memory SQLite
- JWT tokens use test secret keys

### Frontend Mocks
- API endpoints mocked with MSW
- localStorage mocked for token storage tests
- Toast notifications mocked
- Navigation mocked with MemoryRouter

### Test Users
- `test@example.com` - Active user for login tests
- `inactive@example.com` - Inactive user for testing account status
- `newuser@example.com` - For registration tests

## Continuous Integration

The tests are designed to run in CI environments:

- No external dependencies required
- All services mocked appropriately
- Deterministic test data
- Proper cleanup after each test
- Parallel execution safe

## Troubleshooting

### Common Issues

1. **Import Errors:** Ensure all dependencies are installed
2. **Database Errors:** Tests use in-memory database, no setup required
3. **Token Errors:** Tests generate mock tokens, no real JWT secrets needed
4. **Network Errors:** All API calls are mocked, no network required

### Debug Mode

Run tests with verbose output:

```bash
# Backend
python -m pytest tests/test_auth_backend.py -v -s

# Frontend  
npm run test -- --run src/test/auth-frontend.test.tsx --reporter=verbose
```

## Contributing

When adding new authentication features:

1. Add corresponding tests to both backend and frontend suites
2. Update mock handlers if new API endpoints are added
3. Ensure tests cover both success and failure scenarios
4. Add integration tests for complex workflows
5. Update this README with new test coverage

## Security Considerations

The tests verify important security aspects:

- Password hashing (never store plain text)
- JWT token validation and expiration
- Protected endpoint access control
- User data isolation
- Proper error handling without information leakage
- Cross-tab authentication synchronization
- Token storage security