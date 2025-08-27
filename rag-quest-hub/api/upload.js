import { requireAuth } from './lib/auth.js';
import { getDatabase } from './lib/database.js';
import { generateEmbeddings, getEmbeddingDimension } from './lib/embeddings.js';
import { getQdrantClient, ensureUserCollectionExists } from './lib/qdrant.js';
import { chunkText, calculateFileHash, parseDocument, validateFileType, validateFileSize } from './lib/processing.js';
import { v4 as uuidv4 } from 'uuid';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function uploadHandler(req, res) {
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
    
    // Parse form data
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.status(422).json({
        error: 'ValidationError',
        detail: 'No file provided',
        status_code: 422,
        timestamp: new Date().toISOString()
      });
    }

    // Validate file
    const fileExtension = validateFileType(file.originalFilename);
    validateFileSize(file.size);

    // Read file content
    const fileContent = fs.readFileSync(file.filepath, 'utf8');
    
    // Calculate file hash for duplicate detection
    const fileHash = calculateFileHash(fileContent);
    
    // Check for duplicate uploads by this user
    const db = await getDatabase();
    const existingDoc = await db.get(
      'SELECT filename, upload_date, chunks_count FROM document_metadata WHERE user_id = ? AND file_hash = ?',
      [user.id, fileHash]
    );

    if (existingDoc) {
      return res.status(200).json({
        filename: file.originalFilename,
        message: `File already exists (uploaded as '${existingDoc.filename}' on ${existingDoc.upload_date})`,
        num_chunks_stored: existingDoc.chunks_count
      });
    }

    // Parse document text
    const text = parseDocument(fileContent, fileExtension);
    
    if (!text || !text.trim()) {
      return res.status(422).json({
        error: 'EmptyFileError',
        detail: 'File appears to be empty or contains no readable text',
        status_code: 422,
        timestamp: new Date().toISOString()
      });
    }

    // Create text chunks
    const chunks = chunkText(text);
    
    if (chunks.length === 0) {
      return res.status(422).json({
        error: 'EmptyFileError',
        detail: 'No text chunks could be created from the file',
        status_code: 422,
        timestamp: new Date().toISOString()
      });
    }

    // Generate embeddings
    const embeddings = await generateEmbeddings(chunks);
    
    // Ensure user collection exists
    const embeddingDimension = getEmbeddingDimension();
    const collectionName = await ensureUserCollectionExists(user.id, embeddingDimension);
    
    // Prepare payloads for vector store
    const payloads = chunks.map(chunk => ({
      text: chunk,
      source: file.originalFilename,
      user_id: user.id,
      upload_date: new Date().toISOString()
    }));
    
    // Store in Qdrant
    const qdrantClient = getQdrantClient();
    await qdrantClient.upsertVectors(collectionName, embeddings, payloads);
    
    // Store document metadata in database
    const docId = uuidv4();
    await db.run(
      `INSERT INTO document_metadata (id, user_id, filename, original_size, chunks_count, file_hash, upload_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [docId, user.id, file.originalFilename, file.size, chunks.length, fileHash, new Date().toISOString()]
    );

    // Clean up temporary file
    fs.unlinkSync(file.filepath);

    return res.status(200).json({
      filename: file.originalFilename,
      message: 'Successfully uploaded, processed, and stored in your personal knowledge base.',
      num_chunks_stored: chunks.length
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    if (error.message.includes('File size exceeds')) {
      return res.status(413).json({
        error: 'FileProcessingError',
        detail: error.message,
        status_code: 413,
        timestamp: new Date().toISOString()
      });
    }
    
    if (error.message.includes('Unsupported file type')) {
      return res.status(422).json({
        error: 'InvalidFileTypeError',
        detail: error.message,
        status_code: 422,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(500).json({
      error: 'InternalServerError',
      detail: 'An unexpected error occurred during file upload',
      status_code: 500,
      timestamp: new Date().toISOString()
    });
  }
}

export default requireAuth(uploadHandler);