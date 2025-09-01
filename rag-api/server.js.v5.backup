const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');
const crypto = require('crypto');
const DocumentDatabase = require('./database.js');

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
    const result = await DocumentDatabase.deleteDocument(documentId);
    
    res.json({
      success: true,
      message: 'Document deleted successfully',
      deletedVectors: result.deletedVectors || 0
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
    const result = await DocumentDatabase.deleteAllDocuments();
    
    res.json({
      success: true,
      message: 'All documents deleted successfully',
      deletedDocuments: result.deletedDocuments || 0,
      deletedVectors: result.deletedVectors || 0
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

    // Step 3: Create document record in database
    const documentData = {
      filename: req.file.originalname,
      originalFilename: req.file.originalname,
      fileSize: req.file.buffer.length,
      mimeType: req.file.mimetype,
      fileHash: fileHash
    };
    
    const createResult = await DocumentDatabase.createDocument(documentData);
    documentId = createResult.id || createResult;
    console.log('Document created with ID:', documentId);
    await DocumentDatabase.logProcessingStep(documentId, 'upload', 'completed', 'File uploaded successfully');

    // Step 4: Extract text with Tika
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

    // Step 5: Chunk the text
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

    // Step 6: Generate embeddings and store in Qdrant
    console.log(`Processing document ${documentId}: Generating embeddings...`);
    await DocumentDatabase.logProcessingStep(documentId, 'embedding', 'started');

    const vectorPoints = [];
    
    console.log('=== EMBEDDING LOOP START ===');
    console.log('About to process chunks:', enrichedChunks.length);
    
    for (let i = 0; i < enrichedChunks.length; i++) {
      const chunk = enrichedChunks[i];
      console.log(`Processing chunk ${i + 1}/${enrichedChunks.length}`);
      console.log(`Chunk ${i} text length:`, chunk.text.length);
      
      try {
        // Get embedding from TEI
        const embeddingResponse = await axios.post('http://172.17.0.1:8081/embed', {
          inputs: chunk.text,
          truncate: true
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        });

        console.log(`TEI response for chunk ${i}:`, {
          status: 'success',
          dataType: typeof embeddingResponse.data,
          isArray: Array.isArray(embeddingResponse.data),
          length: embeddingResponse.data?.length,
          firstElementLength: embeddingResponse.data[0]?.length
        });

        const vector = embeddingResponse.data[0]; // TEI returns [[vector]]
        
        if (!Array.isArray(vector)) {
          throw new Error(`Invalid vector format for chunk ${i}: expected array, got ${typeof vector}`);
        }
        
        vectorPoints.push({
          id: i,
          vector: vector,
          payload: {
            doc_id: chunk.doc_id,
            chunk_id: chunk.chunk_id,
            text: chunk.text,
            chunk_index: chunk.chunk_index,
            start_offset: chunk.start_offset,
            end_offset: chunk.end_offset,
            chunk_length: chunk.chunk_length,
            total_chunks: chunk.total_chunks,
            filename: chunk.filename,
            processed_date: chunk.processed_date
          }
        });
        
        console.log(`Successfully created vector point ${i} with vector length:`, vector.length);
        
      } catch (embeddingError) {
        console.error(`Error processing chunk ${i}:`, embeddingError.message);
        throw new Error(`Embedding failed for chunk ${i}: ${embeddingError.message}`);
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

    // Step 7: Store chunk metadata in database
    console.log(`Processing document ${documentId}: Storing chunk metadata...`);
    await DocumentDatabase.logProcessingStep(documentId, 'storage', 'started');

    // FIXED: Use proper chunk_index values from enrichedChunks
    const chunkData = enrichedChunks.map((chunk, index) => ({
      chunk_index: chunk.chunk_index,  // Now properly set in enrichedChunks
      vector_id: index.toString(),     // Use map index for vector_id
      text: chunk.text,
      chunk_length: chunk.chunk_length,
      start_offset: chunk.start_offset,
      end_offset: chunk.end_offset
    }));

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