import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for handling cookies
});

// You can add interceptors for handling auth tokens here if needed

export const authAPI = {
  login: async (credentials: any) => {
    const response = await api.post('/auth/jwt/login', new URLSearchParams(credentials));
    return response.data;
  },
  register: async (userData: any) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },
  logout: async () => {
    const response = await api.post('/auth/jwt/logout');
    return response.data;
  },
  getCurrentUser: async () => {
    const response = await api.get('/users/me');
    return response.data;
  }
};

export const queryAPI = {
  query: async (question: string) => {
    const response = await api.post('/query', { query: question });
    return response.data;
  },
};

export interface UploadResponse {
  filename: string;
  message: string;
  num_chunks_stored: number;
}

export const documentAPI = {
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post<UploadResponse>('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export default api;
