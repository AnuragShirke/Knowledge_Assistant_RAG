// src/lib/tokenStorage.ts

const TOKEN_KEY = 'authToken';
const EXPIRY_KEY = 'authTokenExpiry';

interface TokenStorage {
  setToken: (token: string, expiresIn?: number) => void;
  getToken: () => string | null;
  clearToken: () => void;
  getTokenExpiry: () => Date | null;
  hasValidToken: () => boolean;
}

export const tokenStorage: TokenStorage = {
  setToken(token, expiresIn = 3600) {
    const expiryDate = new Date(new Date().getTime() + expiresIn * 1000);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EXPIRY_KEY, expiryDate.toISOString());
  },

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  },

  getTokenExpiry() {
    const expiryString = localStorage.getItem(EXPIRY_KEY);
    return expiryString ? new Date(expiryString) : null;
  },

  hasValidToken() {
    const expiry = this.getTokenExpiry();
    return expiry ? new Date() < expiry : false;
  },
};

// This function allows other tabs to react to login/logout events
export function setupStorageListener(callback: (event: StorageEvent) => void): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY || event.key === EXPIRY_KEY) {
      callback(event);
    }
  };
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener('storage', listener);
  };
}
