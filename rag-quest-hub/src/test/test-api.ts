import axios from 'axios';
import type { QueryRequest, QueryResponse, UploadResponse } from '../lib/api';

// Create a test-specific axios instance that bypasses the proxy
const testApi = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Test-specific API functions that mirror the production API
export const testDocumentAPI = {
  upload: async (
    file: File, 
    onUploadProgress?: (progressEvent: any) => void
  ): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await testApi.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
    return response.data;
  },
};

export const testQueryAPI = {
  ask: async (question: string, timeout?: number): Promise<QueryResponse> => {
    const response = await testApi.post('/query', { query: question }, {
      timeout: timeout || 60000,
    });
    return response.data;
  },
};