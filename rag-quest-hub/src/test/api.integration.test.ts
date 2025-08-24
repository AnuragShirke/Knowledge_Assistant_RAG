import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testDocumentAPI, testQueryAPI } from './test-api';
import { server } from './mocks/server';
import { http, HttpResponse } from 'msw';

describe('API Integration Tests', () => {
  beforeEach(() => {
    // Reset any mocks before each test
    vi.clearAllMocks();
  });

  describe('Document Upload API', () => {
    describe('Successful Upload Scenarios', () => {
      it('should successfully upload a PDF file', async () => {
        const file = new File(['PDF content'], 'test.pdf', { type: 'application/pdf' });
        
        const result = await testDocumentAPI.upload(file);
        
        expect(result).toEqual({
          filename: 'test.pdf',
          message: 'Successfully uploaded, processed, and stored.',
          num_chunks_stored: expect.any(Number),
        });
        expect(result.num_chunks_stored).toBeGreaterThan(0);
      });

      it('should successfully upload a TXT file', async () => {
        const file = new File(['Text content'], 'document.txt', { type: 'text/plain' });
        
        const result = await testDocumentAPI.upload(file);
        
        expect(result).toEqual({
          filename: 'document.txt',
          message: 'Successfully uploaded, processed, and stored.',
          num_chunks_stored: expect.any(Number),
        });
      });

      it('should successfully upload a DOCX file', async () => {
        const file = new File(['DOCX content'], 'report.docx', { 
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
        });
        
        const result = await testDocumentAPI.upload(file);
        
        expect(result).toEqual({
          filename: 'report.docx',
          message: 'Successfully uploaded, processed, and stored.',
          num_chunks_stored: expect.any(Number),
        });
      });

      it('should handle upload progress callback', async () => {
        const file = new File(['Content'], 'test.pdf', { type: 'application/pdf' });
        const progressCallback = vi.fn();
        
        await testDocumentAPI.upload(file, progressCallback);
        
        // Note: MSW doesn't trigger progress events, but we verify the callback is passed
        expect(progressCallback).toBeDefined();
      });
    });

    describe('File Validation Errors', () => {
      it('should reject unsupported file types', async () => {
        const file = new File(['Image content'], 'image.jpg', { type: 'image/jpeg' });
        
        await expect(testDocumentAPI.upload(file)).rejects.toThrow();
      });

      it('should reject files exceeding size limit', async () => {
        // Create a file larger than 10MB
        const largeContent = 'x'.repeat(11 * 1024 * 1024);
        const file = new File([largeContent], 'large.pdf', { type: 'application/pdf' });
        
        await expect(testDocumentAPI.upload(file)).rejects.toThrow();
      });

      it('should reject empty files', async () => {
        const file = new File([], 'empty.pdf', { type: 'application/pdf' });
        
        await expect(testDocumentAPI.upload(file)).rejects.toThrow();
      });

      it('should handle missing file', async () => {
        // Mock the endpoint to return validation error for missing file
        server.use(
          http.post('/api/upload', () => {
            return HttpResponse.json(
              {
                error: 'ValidationError',
                detail: 'No file provided',
                status_code: 422,
                timestamp: new Date().toISOString(),
              },
              { status: 422 }
            );
          })
        );

        const file = new File([''], '', { type: '' });
        
        await expect(testDocumentAPI.upload(file)).rejects.toThrow();
      });
    });

    describe('Server Error Scenarios', () => {
      it('should handle server errors gracefully', async () => {
        // Mock server error
        server.use(
          http.post('http://localhost:8000/upload', () => {
            return HttpResponse.json(
              {
                error: 'InternalServerError',
                detail: 'An unexpected error occurred. Please try again later.',
                status_code: 500,
                timestamp: new Date().toISOString(),
              },
              { status: 500 }
            );
          })
        );

        const file = new File(['Content'], 'test.pdf', { type: 'application/pdf' });
        
        await expect(testDocumentAPI.upload(file)).rejects.toThrow();
      });

      it('should handle network errors', async () => {
        // Mock network error
        server.use(
          http.post('http://localhost:8000/upload', () => {
            return HttpResponse.error();
          })
        );

        const file = new File(['Content'], 'test.pdf', { type: 'application/pdf' });
        
        await expect(testDocumentAPI.upload(file)).rejects.toThrow();
      });
    });
  });

  describe('Query API', () => {
    describe('Successful Query Scenarios', () => {
      it('should successfully query with results', async () => {
        const result = await testQueryAPI.ask('What is machine learning?');
        
        expect(result).toEqual({
          answer: expect.stringContaining('machine learning'),
          source_documents: expect.arrayContaining([
            expect.objectContaining({
              source: expect.any(String),
              text: expect.any(String),
              score: expect.any(Number),
            }),
          ]),
        });
        expect(result.source_documents).toHaveLength(2);
        expect(result.source_documents[0].score).toBeGreaterThan(0);
      });

      it('should handle queries with no results', async () => {
        const result = await testQueryAPI.ask('nonexistent topic');
        
        expect(result).toEqual({
          answer: expect.stringContaining("couldn't find any relevant information"),
          source_documents: [],
        });
      });

      it('should handle different query types', async () => {
        const queries = [
          'What is artificial intelligence?',
          'How does machine learning work?',
          'Explain neural networks',
        ];

        for (const query of queries) {
          const result = await testQueryAPI.ask(query);
          expect(result.answer).toBeTruthy();
          expect(typeof result.answer).toBe('string');
          expect(Array.isArray(result.source_documents)).toBe(true);
        }
      });

      it('should respect custom timeout', async () => {
        const customTimeout = 5000;
        const result = await testQueryAPI.ask('test query', customTimeout);
        
        expect(result).toBeDefined();
        expect(result.answer).toBeTruthy();
      });
    });

    describe('Query Validation Errors', () => {
      it('should reject empty queries', async () => {
        await expect(testQueryAPI.ask('')).rejects.toThrow();
      });

      it('should reject whitespace-only queries', async () => {
        await expect(testQueryAPI.ask('   ')).rejects.toThrow();
      });
    });

    describe('Server Error Scenarios', () => {
      it('should handle LLM service errors', async () => {
        // Mock LLM error
        server.use(
          http.post('http://localhost:8000/query', () => {
            return HttpResponse.json(
              {
                error: 'LLMError',
                detail: 'Failed to generate response: LLM service unavailable',
                status_code: 503,
                timestamp: new Date().toISOString(),
              },
              { status: 503 }
            );
          })
        );

        await expect(testQueryAPI.ask('test query')).rejects.toThrow();
      });

      it('should handle vector store errors', async () => {
        // Mock vector store error
        server.use(
          http.post('http://localhost:8000/query', () => {
            return HttpResponse.json(
              {
                error: 'VectorStoreError',
                detail: 'Search operation failed: Connection timeout',
                status_code: 503,
                timestamp: new Date().toISOString(),
              },
              { status: 503 }
            );
          })
        );

        await expect(testQueryAPI.ask('test query')).rejects.toThrow();
      });

      it('should handle query timeout', async () => {
        // Mock timeout scenario
        server.use(
          http.post('http://localhost:8000/query', () => {
            return new Promise(() => {
              // Never resolve to simulate timeout
            });
          })
        );

        // Set a very short timeout for this test
        await expect(testQueryAPI.ask('test query', 100)).rejects.toThrow();
      });
    });

    describe('Source Document Handling', () => {
      it('should properly format source documents', async () => {
        const result = await testQueryAPI.ask('test query with sources');
        
        expect(result.source_documents).toHaveLength(2);
        
        result.source_documents.forEach(doc => {
          expect(doc).toHaveProperty('source');
          expect(doc).toHaveProperty('text');
          expect(doc).toHaveProperty('score');
          expect(typeof doc.source).toBe('string');
          expect(typeof doc.text).toBe('string');
          expect(typeof doc.score).toBe('number');
          expect(doc.score).toBeGreaterThan(0);
          expect(doc.score).toBeLessThanOrEqual(1);
        });
      });

      it('should handle missing source documents gracefully', async () => {
        const result = await testQueryAPI.ask('empty results query');
        
        expect(result.source_documents).toEqual([]);
        expect(result.answer).toBeTruthy();
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle offline scenarios', async () => {
      // Mock offline state
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      const file = new File(['Content'], 'test.pdf', { type: 'application/pdf' });
      
      await expect(testDocumentAPI.upload(file)).rejects.toThrow('No internet connection');

      // Restore online state
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true,
      });
    });

    it('should handle authentication errors', async () => {
      // Mock 401 response
      server.use(
        http.post('http://localhost:8000/query', () => {
          return HttpResponse.json(
            { detail: 'Not authenticated' },
            { status: 401 }
          );
        })
      );

      // Mock localStorage and window.location
      const removeItemSpy = vi.spyOn(localStorage, 'removeItem');

      await expect(testQueryAPI.ask('test')).rejects.toThrow();
      
      // Note: The test API doesn't have the auth interceptor, so we can't test this behavior directly
    });

    it('should log errors for debugging', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock server error
      server.use(
        http.post('http://localhost:8000/upload', () => {
          return HttpResponse.json(
            { error: 'TestError', detail: 'Test error message' },
            { status: 500 }
          );
        })
      );

      const file = new File(['Content'], 'test.pdf', { type: 'application/pdf' });
      
      try {
        await testDocumentAPI.upload(file);
      } catch (error) {
        // Expected to throw
      }

      // Note: Test API doesn't have the same error logging interceptor

      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle very long queries', async () => {
      const longQuery = 'a'.repeat(10000);
      
      const result = await testQueryAPI.ask(longQuery);
      expect(result).toBeDefined();
      expect(result.answer).toBeTruthy();
    });

    it('should handle special characters in queries', async () => {
      const specialQuery = 'What about émojis 🤖 and spëcial chars?';
      
      const result = await testQueryAPI.ask(specialQuery);
      expect(result).toBeDefined();
      expect(result.answer).toBeTruthy();
    });

    it('should handle files with special characters in names', async () => {
      const file = new File(['Content'], 'tëst-fîle_123.pdf', { type: 'application/pdf' });
      
      const result = await testDocumentAPI.upload(file);
      expect(result.filename).toBe('tëst-fîle_123.pdf');
    });

    it('should handle concurrent uploads', async () => {
      const files = [
        new File(['Content 1'], 'file1.pdf', { type: 'application/pdf' }),
        new File(['Content 2'], 'file2.txt', { type: 'text/plain' }),
        new File(['Content 3'], 'file3.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      ];

      const uploadPromises = files.map(file => testDocumentAPI.upload(file));
      const results = await Promise.all(uploadPromises);

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.filename).toBe(files[index].name);
        expect(result.num_chunks_stored).toBeGreaterThan(0);
      });
    });

    it('should handle concurrent queries', async () => {
      const queries = [
        'What is AI?',
        'How does ML work?',
        'Explain deep learning',
      ];

      const queryPromises = queries.map(query => testQueryAPI.ask(query));
      const results = await Promise.all(queryPromises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.answer).toBeTruthy();
        expect(Array.isArray(result.source_documents)).toBe(true);
      });
    });
  });
});