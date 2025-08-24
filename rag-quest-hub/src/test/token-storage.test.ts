import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tokenStorage, decodeJWT, isTokenExpired, getTokenExpirationDate } from '@/lib/tokenStorage';

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

describe('Token Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('JWT Utilities', () => {
    it('should decode JWT token correctly', () => {
      // Create a mock JWT token (header.payload.signature)
      const mockPayload = { exp: Math.floor(Date.now() / 1000) + 3600, sub: 'user123' };
      const encodedPayload = btoa(JSON.stringify(mockPayload));
      const mockToken = `header.${encodedPayload}.signature`;

      const decoded = decodeJWT(mockToken);
      expect(decoded).toEqual(mockPayload);
    });

    it('should return null for invalid JWT token', () => {
      const decoded = decodeJWT('invalid.token');
      expect(decoded).toBeNull();
    });

    it('should correctly identify expired tokens', () => {
      // Create expired token
      const expiredPayload = { exp: Math.floor(Date.now() / 1000) - 3600 };
      const encodedPayload = btoa(JSON.stringify(expiredPayload));
      const expiredToken = `header.${encodedPayload}.signature`;

      expect(isTokenExpired(expiredToken)).toBe(true);

      // Create valid token
      const validPayload = { exp: Math.floor(Date.now() / 1000) + 3600 };
      const encodedValidPayload = btoa(JSON.stringify(validPayload));
      const validToken = `header.${encodedValidPayload}.signature`;

      expect(isTokenExpired(validToken)).toBe(false);
    });

    it('should get token expiration date', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      const payload = { exp: futureTime };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;

      const expirationDate = getTokenExpirationDate(token);
      expect(expirationDate).toBeInstanceOf(Date);
      expect(expirationDate?.getTime()).toBe(futureTime * 1000);
    });
  });

  describe('Token Storage', () => {
    it('should store valid token', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      const payload = { exp: futureTime };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;

      tokenStorage.setToken(token);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('access_token', token);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'token_expiry',
        new Date(futureTime * 1000).toISOString()
      );
    });

    it('should not store expired token', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600;
      const payload = { exp: pastTime };
      const encodedPayload = btoa(JSON.stringify(payload));
      const expiredToken = `header.${encodedPayload}.signature`;

      tokenStorage.setToken(expiredToken);

      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });

    it('should retrieve valid token', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      const payload = { exp: futureTime };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;
      const expiryDate = new Date(futureTime * 1000).toISOString();

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'access_token') return token;
        if (key === 'token_expiry') return expiryDate;
        return null;
      });

      const retrievedToken = tokenStorage.getToken();
      expect(retrievedToken).toBe(token);
    });

    it('should return null for expired stored token', () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600;
      const payload = { exp: pastTime };
      const encodedPayload = btoa(JSON.stringify(payload));
      const expiredToken = `header.${encodedPayload}.signature`;
      const expiryDate = new Date(pastTime * 1000).toISOString();

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'access_token') return expiredToken;
        if (key === 'token_expiry') return expiryDate;
        return null;
      });

      const retrievedToken = tokenStorage.getToken();
      expect(retrievedToken).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token_expiry');
    });

    it('should clear token and expiry', () => {
      tokenStorage.clearToken();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token_expiry');
    });

    it('should check if token exists and is valid', () => {
      // Mock no token
      localStorageMock.getItem.mockReturnValue(null);
      expect(tokenStorage.hasValidToken()).toBe(false);

      // Mock valid token
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      const payload = { exp: futureTime };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;
      const expiryDate = new Date(futureTime * 1000).toISOString();

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'access_token') return token;
        if (key === 'token_expiry') return expiryDate;
        return null;
      });

      expect(tokenStorage.hasValidToken()).toBe(true);
    });

    it('should calculate time until expiry', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const expiryDate = new Date(futureTime * 1000).toISOString();

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'token_expiry') return expiryDate;
        return null;
      });

      const timeUntilExpiry = tokenStorage.getTimeUntilExpiry();
      expect(timeUntilExpiry).toBeGreaterThan(3590000); // Should be close to 1 hour (3600000ms)
      expect(timeUntilExpiry).toBeLessThan(3600000);
    });

    it('should detect if token is expiring soon', () => {
      // Token expiring in 2 minutes (should return true)
      const soonTime = Math.floor(Date.now() / 1000) + 120;
      const soonExpiryDate = new Date(soonTime * 1000).toISOString();

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'token_expiry') return soonExpiryDate;
        return null;
      });

      expect(tokenStorage.isTokenExpiringSoon()).toBe(true);

      // Token expiring in 10 minutes (should return false)
      const laterTime = Math.floor(Date.now() / 1000) + 600;
      const laterExpiryDate = new Date(laterTime * 1000).toISOString();

      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'token_expiry') return laterExpiryDate;
        return null;
      });

      expect(tokenStorage.isTokenExpiringSoon()).toBe(false);
    });
  });
});