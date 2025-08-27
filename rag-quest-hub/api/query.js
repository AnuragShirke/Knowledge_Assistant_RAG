import { requireAuth } from './lib/auth.js';
import { getDatabase } from './lib/database.js';
import { generateEmbeddings } from './lib/embeddings.js';
import { getQdrantClient, getUserCollectionName } from './lib/qdrant.js';
import { generateResponse, formatPrompt } from './lib/gemini.js';

async function queryHandler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'MethodNotAllowed',
      detail: 'Method not allowed',
      status_code: 405,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const user = req.user;
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(422).json({
        error: 'ValidationError',
        detail: 'Query is required',
        status_code: 422,
        timestamp: new Date().toISOString()
      });
    }

    // Generate query embedding
    const queryEmbedding = await generateEmbeddings(query);
    
    // Get user's collection name
    const collectionName = getUserCollectionName(user.id);
    
    // Search for relevant documents in user's collection
    const qdrantClient = getQdrantClient();
    let searchResults = [];
    
    try {
      searchResults = await qdrantClient.searchVectors(collectionName, queryEmbedding, 3);
    } catch (error) {
      // Collection might not exist if user hasn't uploaded any documents
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        searchResults = [];
      } else {
        throw error;
      }
    }

    // Check if any results were found
    if (!searchResults || searchResults.length === 0) {
      // Check if user has any documents at all
      const db = await getDatabase();
      const docCount = await db.get(
        'SELECT COUNT(*) as count FROM document_metadata WHERE user_id = ?',
        [user.id]
      );
      
      let message;
      if (docCount.count === 0) {
        message = "You haven't uploaded any documents yet. Please upload some documents to build your knowledge base before asking questions.";
      } else {
        message = "I couldn't find any relevant information in your knowledge base to answer your question. Please try rephrasing your query or upload more relevant documents.";
      }
      
      return res.status(200).json({
        answer: message,
        source_documents: []
      });
    }

    // Filter results to ensure they belong to the user (additional security check)
    const filteredResults = searchResults.filter(result => 
      result.payload && result.payload.user_id === user.id
    );
    
    if (filteredResults.length === 0) {
      return res.status(200).json({
        answer: "I couldn't find any relevant information in your personal knowledge base to answer your question. Please try rephrasing your query or upload more relevant documents.",
        source_documents: []
      });
    }

    // Format the prompt for the LLM
    const prompt = formatPrompt(query, filteredResults);
    
    // Generate a response from Gemini
    const answer = await generateResponse(prompt);
    
    // Extract source documents for citation
    const sourceDocuments = filteredResults.map(result => ({
      source: result.payload?.source || 'Unknown',
      text: result.payload?.text?.substring(0, 500) + (result.payload?.text?.length > 500 ? '...' : '') || 'N/A',
      score: result.score || 0.0
    }));

    return res.status(200).json({
      answer: answer,
      source_documents: sourceDocuments
    });

  } catch (error) {
    console.error('Query error:', error);
    
    if (error.message.includes('GEMINI_API_KEY')) {
      return res.status(503).json({
        error: 'ServiceUnavailableError',
        detail: 'LLM service is not configured properly',
        status_code: 503,
        timestamp: new Date().toISOString()
      });
    }
    
    if (error.message.includes('OPENAI_API_KEY')) {
      return res.status(503).json({
        error: 'ServiceUnavailableError',
        detail: 'Embedding service is not configured properly',
        status_code: 503,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(500).json({
      error: 'InternalServerError',
      detail: 'An unexpected error occurred during query processing',
      status_code: 500,
      timestamp: new Date().toISOString()
    });
  }
}

export default requireAuth(queryHandler);