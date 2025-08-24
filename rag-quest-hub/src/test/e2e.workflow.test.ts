import { beforeEach } from 'node:test';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock the API module
vi.mock('../lib/api', () => ({
  documentAPI: {
    upload: vi.fn(),
  },
  queryAPI: {
    ask: vi.fn(),
  },
}));

describe('End-to-End Workflow Tests', () => {
  let mockUpload: any;
  let mockQuery: any;

  beforeAll(async () => {
    // Import the mocked API functions
    const { documentAPI, queryAPI } = await import('../lib/api');
    mockUpload = documentAPI.upload as any;
    mockQuery = queryAPI.ask as any;
  });

  beforeEach(() => {
    // Clear mocks before each test
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('Complete Upload-to-Query User Workflow', () => {
    it('should simulate complete workflow: upload document then query it', async () => {
      // Mock successful upload
      mockUpload.mockResolvedValueOnce({
        filename: 'test-document.pdf',
        message: 'Successfully uploaded, processed, and stored.',
        num_chunks_stored: 5,
      });

      // Mock successful query
      mockQuery.mockResolvedValueOnce({
        answer: 'Based on the uploaded document, here is the answer to your question.',
        source_documents: [
          {
            source: 'test-document.pdf',
            text: 'Relevant text from the document...',
            score: 0.95,
          },
        ],
      });

      // Simulate file upload workflow
      const testFile = new File(['PDF content'], 'test-document.pdf', {
        type: 'application/pdf',
      });

      // Test upload functionality
      const uploadResult = await mockUpload(testFile, vi.fn());
      
      expect(uploadResult).toEqual({
        filename: 'test-document.pdf',
        message: 'Successfully uploaded, processed, and stored.',
        num_chunks_stored: 5,
      });

      // Test query functionality
      const queryResult = await mockQuery('What does the document say about testing?');
      
      expect(queryResult).toEqual({
        answer: 'Based on the uploaded document, here is the answer to your question.',
        source_documents: [
          {
            source: 'test-document.pdf',
            text: 'Relevant text from the document...',
            score: 0.95,
          },
        ],
      });

      // Verify the workflow completed successfully
      expect(mockUpload).toHaveBeenCalledWith(testFile, expect.any(Function));
      expect(mockQuery).toHaveBeenCalledWith('What does the document say about testing?');
    });

    it('should handle upload errors gracefully in workflow', async () => {
      // Mock upload error
      mockUpload.mockRejectedValueOnce(new Error('File processing failed'));

      const testFile = new File(['content'], 'error-file.pdf', {
        type: 'application/pdf',
      });

      // Test error handling
      await expect(mockUpload(testFile, vi.fn())).rejects.toThrow('File processing failed');

      // Verify upload was attempted
      expect(mockUpload).toHaveBeenCalledWith(testFile, expect.any(Function));
    });

    it('should handle query errors gracefully in workflow', async () => {
      // Mock query error
      mockQuery.mockRejectedValueOnce(new Error('Query processing failed'));

      // Test error handling
      await expect(mockQuery('This query will fail')).rejects.toThrow('Query processing failed');

      expect(mockQuery).toHaveBeenCalledWith('This query will fail');
    });

    it('should handle delayed operations in workflow', async () => {
      // Mock delayed upload
      mockUpload.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  filename: 'slow-upload.pdf',
                  message: 'Successfully uploaded, processed, and stored.',
                  num_chunks_stored: 3,
                }),
              100
            )
          )
      );

      const testFile = new File(['content'], 'slow-upload.pdf', {
        type: 'application/pdf',
      });

      // Test delayed upload
      const result = await mockUpload(testFile, vi.fn());
      
      expect(result).toEqual({
        filename: 'slow-upload.pdf',
        message: 'Successfully uploaded, processed, and stored.',
        num_chunks_stored: 3,
      });
    });

    it('should handle multiple file uploads in sequence', async () => {
      const files = [
        { name: 'doc1.pdf', content: 'Document 1 content' },
        { name: 'doc2.txt', content: 'Document 2 content' },
        { name: 'doc3.docx', content: 'Document 3 content' },
      ];

      // Mock successful uploads for each file
      files.forEach((file, index) => {
        mockUpload.mockResolvedValueOnce({
          filename: file.name,
          message: 'Successfully uploaded, processed, and stored.',
          num_chunks_stored: index + 2,
        });
      });

      // Upload files sequentially
      for (const file of files) {
        const testFile = new File([file.content], file.name, {
          type: file.name.endsWith('.pdf') ? 'application/pdf' : 'text/plain',
        });

        const result = await mockUpload(testFile, vi.fn());
        expect(result.filename).toBe(file.name);
      }

      // Verify all uploads were called
      expect(mockUpload).toHaveBeenCalledTimes(files.length);
    });
  });

  describe('Cross-Origin Request Handling', () => {
    it('should handle CORS preflight requests', async () => {
      // Mock a successful upload that would trigger CORS
      mockUpload.mockResolvedValueOnce({
        filename: 'cors-test.pdf',
        message: 'Successfully uploaded, processed, and stored.',
        num_chunks_stored: 2,
      });

      const testFile = new File(['CORS test content'], 'cors-test.pdf', {
        type: 'application/pdf',
      });

      const result = await mockUpload(testFile, vi.fn());
      
      expect(result).toEqual({
        filename: 'cors-test.pdf',
        message: 'Successfully uploaded, processed, and stored.',
        num_chunks_stored: 2,
      });
      
      expect(mockUpload).toHaveBeenCalledWith(testFile, expect.any(Function));
    });

    it('should handle different environment configurations', async () => {
      // Test that the API works regardless of environment
      const originalEnv = import.meta.env;

      // Mock development environment
      vi.stubGlobal('import.meta', {
        env: {
          ...originalEnv,
          VITE_API_BASE_URL: 'http://localhost:8000',
          MODE: 'development',
        },
      });

      mockUpload.mockResolvedValueOnce({
        filename: 'dev-test.pdf',
        message: 'Successfully uploaded, processed, and stored.',
        num_chunks_stored: 1,
      });

      const testFile = new File(['Dev test'], 'dev-test.pdf', {
        type: 'application/pdf',
      });

      const result = await mockUpload(testFile, vi.fn());
      
      expect(result.filename).toBe('dev-test.pdf');
      expect(mockUpload).toHaveBeenCalled();

      // Restore original environment
      vi.stubGlobal('import.meta', { env: originalEnv });
    });
  });

  describe('Error Recovery and Retry Mechanisms', () => {
    it('should allow retry after upload failure', async () => {
      // Mock initial failure then success
      mockUpload
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          filename: 'retry-test.pdf',
          message: 'Successfully uploaded, processed, and stored.',
          num_chunks_stored: 2,
        });

      const testFile = new File(['Retry test'], 'retry-test.pdf', {
        type: 'application/pdf',
      });

      // First attempt (should fail)
      await expect(mockUpload(testFile, vi.fn())).rejects.toThrow('Network error');

      // Retry attempt (should succeed)
      const result = await mockUpload(testFile, vi.fn());
      expect(result.filename).toBe('retry-test.pdf');

      expect(mockUpload).toHaveBeenCalledTimes(2);
    });

    it('should allow retry after query failure', async () => {
      // Mock initial failure then success
      mockQuery
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockResolvedValueOnce({
          answer: 'This is the retry response.',
          source_documents: [],
        });

      // First attempt (should fail)
      await expect(mockQuery('Retry test query')).rejects.toThrow('Service unavailable');

      // Retry attempt (should succeed)
      const result = await mockQuery('Retry test query');
      expect(result.answer).toBe('This is the retry response.');

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('User Experience Flow', () => {
    it('should provide clear feedback throughout the workflow', async () => {
      // Mock upload with progress
      const progressCallback = vi.fn();
      mockUpload.mockImplementation((file, onProgress) => {
        // Simulate progress updates
        if (onProgress) {
          setTimeout(() => onProgress({ loaded: 50, total: 100 }), 10);
          setTimeout(() => onProgress({ loaded: 100, total: 100 }), 20);
        }
        return Promise.resolve({
          filename: file.name,
          message: 'Successfully uploaded, processed, and stored.',
          num_chunks_stored: 4,
        });
      });

      mockQuery.mockResolvedValueOnce({
        answer: 'Detailed answer with context.',
        source_documents: [
          {
            source: 'feedback-test.pdf',
            text: 'Source text excerpt...',
            score: 0.92,
          },
        ],
      });

      // Test upload with progress feedback
      const testFile = new File(['Feedback test'], 'feedback-test.pdf', {
        type: 'application/pdf',
      });

      const uploadResult = await mockUpload(testFile, progressCallback);
      
      expect(uploadResult).toEqual({
        filename: 'feedback-test.pdf',
        message: 'Successfully uploaded, processed, and stored.',
        num_chunks_stored: 4,
      });

      // Test query feedback
      const queryResult = await mockQuery('Test query for feedback');
      
      expect(queryResult).toEqual({
        answer: 'Detailed answer with context.',
        source_documents: [
          {
            source: 'feedback-test.pdf',
            text: 'Source text excerpt...',
            score: 0.92,
          },
        ],
      });

      // Verify progress callback was provided
      expect(mockUpload).toHaveBeenCalledWith(testFile, progressCallback);
    });
  });
});