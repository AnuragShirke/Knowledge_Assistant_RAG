import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { server } from './mocks/server';
import '@testing-library/jest-dom';

// Establish API mocking before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests
afterEach(() => server.resetHandlers());

// Clean up after the tests are finished
afterAll(() => server.close());

// Mock environment variables
vi.stubGlobal('import.meta', {
  env: {
    VITE_API_TIMEOUT: '30000',
    VITE_QUERY_TIMEOUT: '60000',
    VITE_API_BASE_URL: 'http://localhost:8000',
  },
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true,
});

// Mock window.location
delete (window as any).location;
window.location = {
  href: '',
  origin: 'http://localhost:8080',
  protocol: 'http:',
  host: 'localhost:8080',
  hostname: 'localhost',
  port: '8080',
  pathname: '/',
  search: '',
  hash: '',
  assign: vi.fn(),
  replace: vi.fn(),
  reload: vi.fn(),
  toString: vi.fn(() => 'http://localhost:8080/'),
} as any;