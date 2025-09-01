const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const DocumentDatabase = require('./database.js');

// Document storage directory
const DOCUMENTS_DIR = '/opt/rag-api/uploads';

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
app.use(cors({
  origin: ['http://35.209.113.236:3000', 'http://localhost:3000'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'RAG API Server'
  });
});

// Serve document files
app.get('/api/documents/:id/download', async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const document = await DocumentDatabase.getDocumentById(documentId);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    if (!document.file_path || !await fs.access(document.file_path).then(() => true).catch(() => false)) {
      return res.status(404).json({
        success: false,
        error: 'Document file not found on disk'
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Disposition', `inline; filename="${document.original_filename}"`);
    res.setHeader('Content-Type', document.mime_type || 'application/octet-stream');
    
    // Stream the file
    const fileStream = require('fs').createReadStream(document.file_path);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error serving document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to serve document'
    });
  }
});

// Get all documents
app.get('/api/documents', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const statusFilter = req.query.status || null;

    const documents = await DocumentDatabase.getDocuments(offset, limit, statusFilter);
    
    // Get total count for pagination
    const totalQuery = `
      SELECT COUNT(*) as total 
      FROM document_summary 
      WHERE ($1::text IS NULL OR processing_status = $1)
    `;
    const { rows } = await DocumentDatabase.pool.query(totalQuery, [statusFilter]);
    const total = parseInt(rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      documents,
      pagination: {
        page,
        limit,
        total,
        pages: totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch documents'
    });
  }
});

// Get single document
app.get('/api/documents/:id', async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    const document = await DocumentDatabase.getDocumentById(documentId);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    res.json({
      success: true,
      document
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch document'
    });
  }
});

// Delete single document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    
    // Get document info first to retrieve file path
    const document = await DocumentDatabase.getDocumentById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }
    
    // Delete from database and get vector IDs
    const result = await DocumentDatabase.deleteDocument(documentId);
    
    let deletedVectorCount = 0;
    
    // Delete vectors from Qdrant if any exist
    if (result.vectorIds && result.vectorIds.length > 0) {
      console.log(`Deleting ${result.vectorIds.length} vectors from Qdrant...`);
      
      try {
        const qdrantResponse = await axios.post(
          'http://172.17.0.1:6333/collections/compliance_docs/points/delete',
          { points: result.vectorIds },
          { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          }
        );
        
        console.log('Qdrant delete response:', qdrantResponse.data);
        deletedVectorCount = result.vectorIds.length;
      } catch (qdrantError) {
        console.error('Failed to delete vectors from Qdrant:', qdrantError.message);
        // Don't fail the entire operation if Qdrant cleanup fails
      }
    }
    
    // Delete file from disk
    if (document.file_path) {
      try {
        await fs.unlink(document.file_path);
        console.log(`Deleted file: ${document.file_path}`);
      } catch (fileError) {
        console.error(`Failed to delete file ${document.file_path}:`, fileError.message);
        // Don't fail the entire operation if file cleanup fails
      }
    }
    
    res.json({
      success: true,
      message: 'Document deleted successfully',
      deletedDocument: result.deletedDocument?.filename,
      deletedChunks: result.vectorIds?.length || 0,
      deletedVectors: deletedVectorCount
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete document'
    });
  }
});

// Delete all documents
app.delete('/api/documents', async (req, res) => {
  try {
    // Get all document file paths before deletion
    const filePathsResult = await DocumentDatabase.pool.query('SELECT file_path FROM documents WHERE file_path IS NOT NULL');
    const filePaths = filePathsResult.rows.map(row => row.file_path);
    
    // Get document count before deletion
    const countResult = await DocumentDatabase.pool.query('SELECT COUNT(*) as count FROM documents');
    const documentCount = parseInt(countResult.rows[0].count);
    
    // Delete from database and get vector IDs
    const result = await DocumentDatabase.deleteAllDocuments();
    
    let deletedVectorCount = 0;
    
    // Delete vectors from Qdrant if any exist
    if (result.vectorIds && result.vectorIds.length > 0) {
      console.log(`Deleting ${result.vectorIds.length} vectors from Qdrant...`);
      
      try {
        // For large deletions, it's more efficient to recreate the collection
        if (result.vectorIds.length > 100) {
          console.log('Large deletion detected, recreating Qdrant collection...');
          
          // Delete collection
          await axios.delete('http://172.17.0.1:6333/collections/compliance_docs');
          
          // Recreate collection
          await axios.put(
            'http://172.17.0.1:6333/collections/compliance_docs',
            { vectors: { size: 384, distance: 'Cosine' } },
            { headers: { 'Content-Type': 'application/json' } }
          );
          
          deletedVectorCount = result.vectorIds.length;
        } else {
          // Delete individual points
          const qdrantResponse = await axios.post(
            'http://172.17.0.1:6333/collections/compliance_docs/points/delete',
            { points: result.vectorIds },
            { 
              headers: { 'Content-Type': 'application/json' },
              timeout: 30000
            }
          );
          
          console.log('Qdrant delete response:', qdrantResponse.data);
          deletedVectorCount = result.vectorIds.length;
        }
      } catch (qdrantError) {
        console.error('Failed to delete vectors from Qdrant:', qdrantError.message);
        // Don't fail the entire operation if Qdrant cleanup fails
      }
    }
    
    // Delete all files from disk
    let deletedFiles = 0;
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        deletedFiles++;
        console.log(`Deleted file: ${filePath}`);
      } catch (fileError) {
        console.error(`Failed to delete file ${filePath}:`, fileError.message);
        // Continue with other files even if one fails
      }
    }
    
    res.json({
      success: true,
      message: 'All documents deleted successfully',
      deletedDocuments: documentCount,
      deletedChunks: result.vectorIds?.length || 0,
      deletedVectors: deletedVectorCount,
      deletedFiles: deletedFiles
    });
  } catch (error) {
    console.error('Error deleting all documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete all documents'
    });
  }
});

// Internal endpoint for n8n to store chunks
app.post('/api/internal/store-chunks', async (req, res) => {
  try {
    const { document_id, filename, chunks, total_chunks } = req.body;
    
    if (!document_id || !chunks) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: document_id, chunks'
      });
    }

    // Find document by document_id (from n8n workflow)
    const findDocQuery = `
      SELECT id FROM documents 
      WHERE filename LIKE '%' || $1 || '%' 
      OR id::text = $1
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const { rows } = await DocumentDatabase.pool.query(findDocQuery, [document_id]);
    
    if (rows.length === 0) {
      // Create a new document record if it doesn't exist
      const documentData = {
        filename: filename || `unknown_${document_id}`,
        originalFilename: filename || `unknown_${document_id}`,
        fileSize: 0,
        mimeType: 'application/octet-stream',
        fileHash: crypto.createHash('sha256').update(document_id).digest('hex')
      };
      
      const newDocId = await DocumentDatabase.createDocument(documentData);
      await DocumentDatabase.storeChunks(newDocId, chunks);
      await DocumentDatabase.updateDocumentStatus(newDocId, 'completed', total_chunks || chunks.length);
      
      return res.json({
        success: true,
        message: 'New document created and chunks stored',
        document_id: newDocId,
        chunks_stored: chunks.length
      });
    }

    const dbDocumentId = rows[0].id;
    await DocumentDatabase.storeChunks(dbDocumentId, chunks);
    await DocumentDatabase.updateDocumentStatus(dbDocumentId, 'completed', total_chunks || chunks.length);

    res.json({
      success: true,
      message: 'Chunks stored successfully',
      document_id: dbDocumentId,
      chunks_stored: chunks.length
    });
  } catch (error) {
    console.error('Error storing chunks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store chunks',
      details: error.message
    });
  }
});

// Query endpoint (for n8n compatibility)
app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    // Call the n8n query webhook
    const webhookUrl = 'http://localhost:5678/webhook/d9ece4d6-a9da-494b-bb03-caba40eae672';
    const response = await axios.post(webhookUrl, { query }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    // Parse the response (n8n returns text, need to parse JSON)
    let result;
    if (typeof response.data === 'string') {
      try {
        result = JSON.parse(response.data);
      } catch (parseError) {
        result = {
          answer: response.data,
          found_chunks: 0,
          query: query,
          status: 'success'
        };
      }
    } else {
      result = response.data;
    }

    res.json({
      success: true,
      query: query,
      answer: result.results || result.answer || result,
      found_chunks: result.found_chunks || 0,
      status: 'success'
    });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({
      success: false,
      error: 'Query processing failed',
      details: error.message
    });
  }
});

// Direct document upload endpoint (bypasses n8n)
app.post('/api/upload-document-direct', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const startTime = Date.now();
  let documentId = null;
  let filePath = null;

  try {
    console.log('=== UPLOAD START DEBUG ===');
    console.log('File name:', req.file.originalname);
    console.log('File size:', req.file.buffer.length);
    console.log('File type:', req.file.mimetype);
    console.log('=========================');

    // Step 1: Generate document ID and hash
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    
    // Step 2: Check for duplicates
    const existingDoc = await DocumentDatabase.documentExists(fileHash);
    if (existingDoc) {
      return res.status(409).json({
        success: false,
        error: 'Document already exists',
        existing_document_id: existingDoc.id
      });
    }

    // Step 3: Save file to disk
    const fileExtension = path.extname(req.file.originalname);
    const safeFilename = `${documentId || Date.now()}_${crypto.randomBytes(8).toString('hex')}${fileExtension}`;
    filePath = path.join(DOCUMENTS_DIR, safeFilename);
    
    // Ensure directory exists
    await fs.mkdir(DOCUMENTS_DIR, { recursive: true });
    
    // Save file to disk
    await fs.writeFile(filePath, req.file.buffer);
    console.log(`File saved to: ${filePath}`);

    // Step 4: Create document record in database
    const documentData = {
      filename: req.file.originalname,
      originalFilename: req.file.originalname,
      fileSize: req.file.buffer.length,
      mimeType: req.file.mimetype,
      fileHash: fileHash,
      filePath: filePath
    };
    
    const createResult = await DocumentDatabase.createDocument(documentData);
    documentId = createResult.id || createResult;
    console.log('Document created with ID:', documentId);
    await DocumentDatabase.logProcessingStep(documentId, 'upload', 'completed', 'File uploaded and saved successfully');

    // Step 5: Extract text with Tika
    console.log(`Processing document ${documentId}: Extracting text...`);
    await DocumentDatabase.logProcessingStep(documentId, 'extraction', 'started');
    
    const formData = new FormData();
    formData.append('file', req.file.buffer, req.file.originalname);
    
    const tikaResponse = await axios.post('http://35.209.113.236:9998/tika/form', formData, {
      headers: {
        ...formData.getHeaders(),
        'Accept': 'text/plain'
      },
      timeout: 60000
    });
    
    const extractedText = tikaResponse.data;
    console.log('=== TIKA EXTRACTION DEBUG ===');
    console.log('Extracted text length:', extractedText.length);
    console.log('First 100 chars:', extractedText.substring(0, 100));
    console.log('============================');
    
    await DocumentDatabase.logProcessingStep(documentId, 'extraction', 'completed', 
      `Extracted ${extractedText.length} characters`);

    // Step 6: Chunk the text
    console.log(`Processing document ${documentId}: Chunking text...`);
    await DocumentDatabase.logProcessingStep(documentId, 'chunking', 'started');
    
    const chunks = chunkText(extractedText, {
      chunkSize: 800,
      overlap: 100,
      minChunkSize: 100
    });

    console.log('=== CHUNKING DEBUG ===');
    console.log('Raw chunks created:', chunks.length);
    console.log('First chunk preview:', chunks[0]?.text?.substring(0, 100));
    console.log('First chunk length:', chunks[0]?.length);
    console.log('===================');

    const enrichedChunks = chunks.map((chunk, index) => ({
      doc_id: docId,
      chunk_id: `${docId}_chunk_${index}`,
      text: chunk.text,
      chunk_index: index,  // FIXED: Use index from map function
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset,
      chunk_length: chunk.length,
      total_chunks: chunks.length,
      filename: req.file.originalname,
      processed_date: new Date().toISOString()
    }));

    console.log('=== ENRICHED CHUNKS DEBUG ===');
    console.log('Enriched chunks count:', enrichedChunks.length);
    console.log('First enriched chunk keys:', Object.keys(enrichedChunks[0] || {}));
    console.log('First enriched chunk index:', enrichedChunks[0]?.chunk_index);
    console.log('============================');

    await DocumentDatabase.logProcessingStep(documentId, 'chunking', 'completed', 
      `Created ${chunks.length} chunks`);

    // Step 7: Generate embeddings and store in Qdrant
    console.log(`Processing document ${documentId}: Generating embeddings...`);
    await DocumentDatabase.logProcessingStep(documentId, 'embedding', 'started');

    const vectorPoints = [];
    const storedVectorIds = []; // Track stored vectors for cleanup on failure
    
    console.log('=== EMBEDDING BATCH START ===');
    console.log('About to process chunks:', enrichedChunks.length);
    
    // Process embeddings in batches for better performance
    const batchSize = 10;
    for (let batchStart = 0; batchStart < enrichedChunks.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, enrichedChunks.length);
      const batchChunks = enrichedChunks.slice(batchStart, batchEnd);
      
      console.log(`Processing batch ${Math.floor(batchStart/batchSize) + 1}/${Math.ceil(enrichedChunks.length/batchSize)} (chunks ${batchStart + 1}-${batchEnd})`);
      
      try {
        // Process batch of embeddings in parallel
        const embeddingPromises = batchChunks.map(async (chunk, batchIndex) => {
          const globalIndex = batchStart + batchIndex;
          const embeddingResponse = await axios.post('http://172.17.0.1:8081/embed', {
            inputs: chunk.text,
            truncate: true
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000
          });
          
          const vector = embeddingResponse.data[0]; // TEI returns [[vector]]
          
          if (!Array.isArray(vector)) {
            throw new Error(`Invalid vector format for chunk ${globalIndex}: expected array, got ${typeof vector}`);
          }
          
          return {
            index: globalIndex,
            vector: vector,
            chunk: chunk
          };
        });
        
        const batchResults = await Promise.all(embeddingPromises);
        
        // Add results to vectorPoints with UUID IDs
        for (const result of batchResults) {
          const vectorId = uuidv4(); // Generate UUID for Qdrant
          vectorPoints.push({
            id: vectorId, // Use UUID for Qdrant compatibility
            vector: result.vector,
            payload: {
              doc_id: result.chunk.doc_id,
              chunk_id: result.chunk.chunk_id,
              text: result.chunk.text,
              chunk_index: result.chunk.chunk_index,
              start_offset: result.chunk.start_offset,
              end_offset: result.chunk.end_offset,
              chunk_length: result.chunk.chunk_length,
              total_chunks: result.chunk.total_chunks,
              filename: result.chunk.filename,
              processed_date: result.chunk.processed_date,
              db_document_id: documentId, // Add document ID for reference
              vector_index: result.index   // Keep original index for ordering
            }
          });
          storedVectorIds.push(vectorId);
        }
        
        console.log(`Batch processed successfully: ${batchResults.length} embeddings generated`);
        
      } catch (embeddingError) {
        console.error(`Error processing batch starting at ${batchStart}:`, embeddingError.message);
        
        // Cleanup any already stored vectors on failure
        if (storedVectorIds.length > 0) {
          try {
            console.log(`Cleaning up ${storedVectorIds.length} orphaned vectors...`);
            await axios.post(
              'http://172.17.0.1:6333/collections/compliance_docs/points/delete',
              { points: storedVectorIds },
              { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
            );
          } catch (cleanupError) {
            console.error('Failed to cleanup orphaned vectors:', cleanupError.message);
          }
        }
        
        throw new Error(`Embedding batch failed at chunks ${batchStart}-${batchEnd}: ${embeddingError.message}`);
      }
    }

    console.log('=== QDRANT DEBUG ===');
    console.log('Vector points array length:', vectorPoints.length);
    if (vectorPoints.length > 0) {
      console.log('First vector point structure:', JSON.stringify({
        id: vectorPoints[0].id,
        vectorLength: vectorPoints[0].vector.length,
        vectorSample: vectorPoints[0].vector.slice(0, 5),
        payloadKeys: Object.keys(vectorPoints[0].payload)
      }, null, 2));
    }
    console.log('===================');

    if (vectorPoints.length === 0) {
      throw new Error('No vector points generated - all chunks failed processing');
    }

    // Store all vectors in Qdrant
    console.log('Sending request to Qdrant...');
    const qdrantResponse = await axios.put(
      'http://172.17.0.1:6333/collections/compliance_docs/points',
      { points: vectorPoints },
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    console.log('Qdrant response:', qdrantResponse.data);

    await DocumentDatabase.logProcessingStep(documentId, 'embedding', 'completed', 
      `Stored ${vectorPoints.length} vectors in Qdrant`);

    // Step 8: Store chunk metadata in database
    console.log(`Processing document ${documentId}: Storing chunk metadata...`);
    await DocumentDatabase.logProcessingStep(documentId, 'storage', 'started');

    // Map vector IDs from vectorPoints to chunk data
    const chunkData = enrichedChunks.map((chunk, index) => {
      // Find the corresponding vector point by matching the index
      const vectorPoint = vectorPoints.find(vp => vp.payload.vector_index === index);
      return {
        chunk_index: chunk.chunk_index,  
        vector_id: vectorPoint ? vectorPoint.id : uuidv4(),  // Use the UUID from vectorPoints
        text: chunk.text,
        chunk_length: chunk.chunk_length,
        start_offset: chunk.start_offset,
        end_offset: chunk.end_offset
      };
    });

    console.log('=== DATABASE STORAGE DEBUG ===');
    console.log('Chunk data count:', chunkData.length);
    console.log('First chunk data:', JSON.stringify(chunkData[0], null, 2));
    console.log('=============================');

    await DocumentDatabase.storeChunks(documentId, chunkData);
    await DocumentDatabase.updateDocumentStatus(documentId, 'completed', chunks.length);
    
    const processingTime = Date.now() - startTime;
    await DocumentDatabase.logProcessingStep(documentId, 'storage', 'completed', 
      `Processing completed in ${processingTime}ms`, processingTime);

    console.log(`Document ${documentId} processed successfully in ${processingTime}ms`);

    res.json({
      success: true,
      message: 'Document processed successfully',
      document_id: documentId,
      filename: req.file.originalname,
      total_chunks: chunks.length,
      processing_time_ms: processingTime
    });

  } catch (error) {
    console.error('Document processing error:', error);
    
    // Cleanup: remove saved file if processing failed
    if (filePath) {
      try {
        await fs.unlink(filePath);
        console.log(`Cleaned up failed upload file: ${filePath}`);
      } catch (cleanupError) {
        console.error(`Failed to cleanup file ${filePath}:`, cleanupError.message);
      }
    }
    
    if (documentId) {
      await DocumentDatabase.updateDocumentStatus(documentId, 'failed');
      await DocumentDatabase.logProcessingStep(documentId, 'error', 'failed', error.message);
    }

    res.status(500).json({
      success: false,
      error: 'Document processing failed',
      message: error.message,
      document_id: documentId
    });
  }
});

// Text chunking function
function chunkText(text, options = {}) {
  const { chunkSize = 800, overlap = 100, minChunkSize = 100 } = options;
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = start + chunkSize;
    
    if (end < text.length) {
      const searchStart = Math.max(end - 150, start + minChunkSize);
      const chunkPart = text.slice(searchStart, end);
      const sentenceEnd = chunkPart.search(/[.!?]\s+/);
      
      if (sentenceEnd !== -1) {
        end = searchStart + sentenceEnd + 1;
      }
    }
    
    const chunk = text.slice(start, end).trim();
    
    if (chunk.length >= minChunkSize) {
      chunks.push({
        text: chunk,
        start_offset: start,
        end_offset: end,
        length: chunk.length
      });
    }
    
    start = end - overlap;
    if (start >= text.length) break;
  }
  
  return chunks;
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`RAG API Server running on port ${PORT}`);
  console.log(`External access: http://35.209.113.236:${PORT}`);
  console.log(`Database: ${process.env.DB_NAME || 'rag_system'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5433}`);
  console.log(`Health check: http://35.209.113.236:${PORT}/api/health`);
  console.log(`Direct upload: http://35.209.113.236:${PORT}/api/upload-document-direct`);
});

module.exports = app;