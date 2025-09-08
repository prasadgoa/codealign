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
const { EnhancedChunker, QueryClassifier, PromptEnhancer } = require('./enhancedChunking.js');
const { RerankClient } = require('./rerankClient.js');
const { PageExtractor } = require('./pageExtractor.js');

// Initialize enhancement components
const enhancedChunker = new EnhancedChunker();
const queryClassifier = new QueryClassifier();
const promptEnhancer = new PromptEnhancer();
const rerankClient = new RerankClient();
const pageExtractor = new PageExtractor();

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
    const action = req.query.action || 'view'; // Default to view if not specified
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

    // Set appropriate headers based on action
    if (action === 'download') {
      // Force download with attachment disposition
      res.setHeader('Content-Disposition', `attachment; filename="${document.original_filename}"`);
    } else {
      // Allow browser to display inline (view mode)
      res.setHeader('Content-Disposition', `inline; filename="${document.original_filename}"`);
    }
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

// Helper functions for LLM-guided attribution
function buildLLMGuidedAttribution(selectedChunks, sourcesUsed) {
  if (!sourcesUsed || sourcesUsed.length === 0) {
    return [];
  }
  
  console.log('=== ATTRIBUTION DEBUG ===');
  console.log('SourcesUsed:', sourcesUsed);
  console.log('Available chunks:', selectedChunks.length);
  selectedChunks.forEach((chunk, i) => {
    console.log(`Chunk ${i} metadata:`, JSON.stringify({
      label: chunk.metadata?.label,
      document: chunk.metadata?.document,
      db_document_id: chunk.metadata?.db_document_id,
      page_number: chunk.metadata?.page_number,
      section: chunk.metadata?.section
    }, null, 2));
  });
  
  const attributedSources = [];
  
  sourcesUsed.forEach(label => {
    // Find the chunk with this label
    const chunk = selectedChunks.find(c => c.metadata.label === label);
    console.log(`Looking for chunk with label "${label}":`, chunk ? 'FOUND' : 'NOT FOUND');
    if (chunk) {
      const source = {
        document: chunk.metadata.document,
        document_id: chunk.metadata.db_document_id || chunk.payload?.db_document_id,
        page: chunk.metadata.page_number || 'N/A',
        section: chunk.metadata.section || 'N/A', 
        excerpt: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
        label: label
      };
      console.log('Built source:', JSON.stringify(source, null, 2));
      attributedSources.push(source);
    }
  });
  
  console.log('=== END ATTRIBUTION DEBUG ===');
  return attributedSources;
}

function enhanceAnswerWithReferences(answer, llmGuidedSources) {
  let enhancedAnswer = answer;
  const finalSources = [];
  
  // Handle undefined or empty sources gracefully
  if (!llmGuidedSources || llmGuidedSources.length === 0) {
    return {
      enhancedAnswer: answer,
      finalSources: []
    };
  }
  
  // Map LLM labels [A], [B] to numbered references [1], [2]
  llmGuidedSources.forEach((source, index) => {
    const labelPattern = new RegExp(`\\[${source.label}\\]`, 'g');
    const numberRef = `[${index + 1}]`;
    
    enhancedAnswer = enhancedAnswer.replace(labelPattern, numberRef);
    
    // Add to final sources list with enhanced metadata and reference number
    finalSources.push({
      reference: `[${index + 1}]`,
      document: source.document,
      document_id: source.document_id,
      page: source.page,
      section: source.section,
      excerpt: source.excerpt
    });
  });
  
  return {
    enhancedAnswer,
    finalSources
  };
}

// Direct query endpoint (bypasses n8n)  
app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    // STEP 0: Quick LLM health check (5-10ms)
    try {
      await axios.get('http://35.209.219.117:8000/health', { 
        timeout: 5000 
      });
    } catch (error) {
      return res.status(503).json({
        success: false,
        error: "LLM service temporarily unavailable",
        details: "Please try again in a few minutes"
      });
    }

    console.log('=== QUERY START DEBUG ===');
    console.log('Query:', query);
    console.log('========================');
    
    const startTime = Date.now();
    let stepTime = startTime;

    // Step 1: Generate embedding for the query
    console.log('Generating query embedding...');
    const embeddingStart = Date.now();
    const embeddingResponse = await axios.post(
      'http://172.17.0.1:8081/embed',
      {
        inputs: query,
        truncate: true
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const queryEmbedding = embeddingResponse.data[0];
    const embeddingTime = Date.now() - embeddingStart;
    console.log(`Query embedding generated, dimension: ${queryEmbedding.length} (${embeddingTime}ms)`);

    // Step 2: Determine retrieval limit based on query type
    const classifyStart = Date.now();
    const queryType = queryClassifier.classifyQuery(query);
    const classifyTime = Date.now() - classifyStart;
    console.log(`Query classified as: ${queryType} (${classifyTime}ms)`);
    const retrievalLimits = {
      'definition': 25,
      'specific_section': 30, 
      'yes_no': 30,
      'list': 50,
      'procedure': 40,
      'analysis': 60,
      'general': 300  // INCREASED: Cast wider net to capture all relevant content
    };
    const retrievalLimit = retrievalLimits[queryType] || retrievalLimits.general;
    
    // Step 3: Search Qdrant for similar vectors (adaptive limit for reranking)
    console.log(`Searching Qdrant for similar chunks (${queryType} query, limit: ${retrievalLimit})...`);
    const qdrantStart = Date.now();
    const qdrantSearchResponse = await axios.post(
      'http://172.17.0.1:6333/collections/compliance_docs/points/search',
      {
        vector: queryEmbedding,
        limit: retrievalLimit,
        with_payload: true,
        with_vector: false
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const searchResults = qdrantSearchResponse.data.result || [];
    const qdrantTime = Date.now() - qdrantStart;
    console.log(`Found ${searchResults.length} relevant chunks (${qdrantTime}ms)`);

    if (searchResults.length === 0) {
      return res.json({
        success: true,
        query: query,
        answer: "I couldn't find any relevant information in the uploaded documents to answer your question. Please make sure you have uploaded documents related to your query.",
        found_chunks: 0,
        sources: [],
        status: 'no_results'
      });
    }

    // Step 4: Get chunk details from database
    const dbStart = Date.now();
    const chunkIds = searchResults.map(result => result.id);
    const chunkDetails = await DocumentDatabase.getChunksByVectorIds(chunkIds);
    const dbTime = Date.now() - dbStart;
    console.log(`Retrieved ${chunkDetails.length} chunk details from database (${dbTime}ms)`);
    
    // Step 5: Prepare documents for reranking
    const documentsForReranking = searchResults.map((result, index) => {
      const chunk = chunkDetails.find(c => c.vector_id === result.id);
      return {
        text: result.payload.text || chunk?.text || '',
        metadata: {
          vector_score: result.score,
          document: result.payload.filename || chunk?.filename || 'Unknown',
          chunk_index: result.payload.chunk_index || chunk?.chunk_index || index,
          page_number: chunk?.page_number || null,
          section: chunk?.section || null,
          vector_id: result.id,
          db_document_id: chunk?.document_id || null
        }
      };
    });
    
    // Step 6: Apply vector-first token-based adaptive chunk selection (with lazy reranking)
    console.log('Applying vector-first adaptive selection with lazy reranking...');
    const selectionStart = Date.now();
    const selectionResult = queryClassifier.selectOptimalChunks(query, documentsForReranking);
    const selectedChunks = selectionResult.chunks;
    const selectionTime = Date.now() - selectionStart;
    
    console.log(`Query type: ${queryType}, Selected ${selectedChunks.length} chunks (${selectionTime}ms)`);
    
    // Step 8: Prepare context for LLM
    const context = selectedChunks.map((chunk, index) => ({
      text: chunk.text,
      rerank_score: chunk.rerank_score,
      vector_score: chunk.metadata.vector_score,
      document: chunk.metadata.document,
      chunk_index: chunk.metadata.chunk_index,
      page_number: chunk.metadata.page_number,
      section: chunk.metadata.section,
      relevance: chunk.rerank_score.toFixed(2)
    }));

    console.log('=== ENHANCED CONTEXT DEBUG ===');
    console.log('Selected chunks:', selectedChunks.length);
    console.log('Query type:', queryType);
    console.log('Top rerank score:', context[0]?.rerank_score?.toFixed(3));
    console.log('===============================');

    // Step 9: Generate enhanced prompt
    console.log('Generating enhanced prompt...');
    const promptStart = Date.now();
    const llmPrompt = promptEnhancer.buildEnhancedPrompt(query, selectedChunks, queryType);
    const promptTime = Date.now() - promptStart;

    console.log('=== ENHANCED PROMPT DEBUG ===');
    console.log(`Prompt length: ${llmPrompt.length} (${promptTime}ms)`);
    console.log('Query type used:', queryType);
    console.log('Prompt preview:', llmPrompt.substring(0, 400));
    console.log('=============================');

    let generatedAnswer;
    let llmGuidedSources = [];
    let llmTime = 0;
    let parseTime = 0;
    try {
      console.log('Calling LLM for answer generation...');
    console.log('=== FULL PROMPT SENT TO VLLM ===');
    console.log(llmPrompt);
    console.log('=== END PROMPT ===');
      const llmStart = Date.now();
      const llmResponse = await axios.post(
        'http://35.209.219.117:8000/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instruct',
          messages: [
            {
              role: 'user',
              content: llmPrompt
            }
          ],
          max_tokens: 500,  // Increased for more detailed answers
          temperature: 0.3  // Increased for more natural language responses
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000  // Increased to 2 minutes
        }
      );
      
      const rawLLMResponse = llmResponse.data.choices[0].message.content.trim();
      const llmTime = Date.now() - llmStart;
      console.log(`LLM response generated (${llmTime}ms)`);
      
      // Step 10: Parse LLM response to extract answer and sources used
      const parseStart = Date.now();
      const parsedResponse = promptEnhancer.parseLLMResponse(rawLLMResponse);
      const parseTime = Date.now() - parseStart;
      
      console.log('=== CITATION EXTRACTION DEBUG ===');
      console.log('Parsing method:', parsedResponse.method);
      console.log('Citations found:', parsedResponse.citations_found);
      console.log('Unique sources:', parsedResponse.unique_sources);
      console.log('Sources used:', parsedResponse.sourcesUsed);
      console.log('Success:', parsedResponse.success);
      if (parsedResponse.warning) console.log('Warning:', parsedResponse.warning);
      if (parsedResponse.error) console.log('Error:', parsedResponse.error);
      console.log('==================================');
      
      if (!parsedResponse.success) {
        console.warn('LLM response parsing issue:', parsedResponse.warning || parsedResponse.error);
      }
      
      generatedAnswer = parsedResponse.answer;
      
      // Step 11: Build attribution based on LLM guidance
      llmGuidedSources = buildLLMGuidedAttribution(selectedChunks, parsedResponse.sourcesUsed);
      
      console.log('=== ATTRIBUTION BUILDING DEBUG ===');
      console.log('LLM sources used:', parsedResponse.sourcesUsed);
      console.log('Available chunk labels:', selectedChunks.map(c => c.metadata.label));
      console.log('Built attributions count:', llmGuidedSources.length);
      console.log('===================================');
      
    } catch (llmError) {
      console.error('LLM service error:', llmError.message);
      
      // Fallback: Return context-based answer with traditional attribution
      if (context.length > 0) {
        generatedAnswer = `Based on the available documents, here are the relevant excerpts for your query "${query}":\n\n` + 
          context.slice(0, 3).map((c, i) => 
            `${i + 1}. From "${c.document}": ${c.text.substring(0, 300)}${c.text.length > 300 ? '...' : ''}`
          ).join('\n\n') + 
          '\n\n[Note: LLM service temporarily unavailable, showing relevant document excerpts]';
        
        // Use all chunks for fallback attribution
        llmGuidedSources = selectedChunks.map((c, index) => ({
          document: c.metadata.document,
          page: c.metadata.page_number,
          section: c.metadata.section || 'N/A',
          excerpt: c.text.substring(0, 200) + (c.text.length > 200 ? '...' : ''),
          label: String.fromCharCode(65 + index), // A, B, C for fallback
          relevance_note: 'Fallback attribution - LLM unavailable'
        }));
      } else {
        generatedAnswer = 'Sorry, I could not find relevant information for your query, and the LLM service is currently unavailable.';
        llmGuidedSources = [];
      }
    }

    // Step 12: Enhance answer by converting LLM markers to numbered references
    console.log('=== REFERENCE ENHANCEMENT DEBUG ===');
    console.log('Input sources count:', llmGuidedSources ? llmGuidedSources.length : 'undefined');
    console.log('Input sources structure:', llmGuidedSources);
    const { enhancedAnswer, finalSources } = enhanceAnswerWithReferences(generatedAnswer, llmGuidedSources);
    console.log('Output final sources count:', finalSources ? finalSources.length : 'undefined');
    console.log('=====================================');
    
    const response = {
      success: true,
      query: query,
      query_type: queryType,
      answer: enhancedAnswer,
      chunks_analyzed: searchResults.length,
      chunks_used: selectedChunks.length,
      sources: finalSources,
      enhancement_info: {
        llm_guided_attribution: true,
        natural_language_format: true,
        temperature: 0.3
      },
      status: 'success'
    };

    const totalTime = Date.now() - startTime;
    
    console.log('=== QUERY COMPLETE ===');
    console.log(`Answer length: ${generatedAnswer.length} chars`);
    console.log(`Sources: ${context.length}`);
    console.log('====================');
    
    // Comprehensive timing breakdown
    console.log('TIMING_BREAKDOWN:', JSON.stringify({
      total_time_ms: totalTime,
      embedding_time_ms: embeddingTime,
      classification_time_ms: classifyTime,
      qdrant_search_time_ms: qdrantTime,
      db_retrieval_time_ms: dbTime,
      chunk_selection_time_ms: selectionTime,
      prompt_generation_time_ms: promptTime,
      llm_response_time_ms: llmTime,
      response_parsing_time_ms: parseTime,
      embedding_pct: ((embeddingTime / totalTime) * 100).toFixed(1),
      qdrant_pct: ((qdrantTime / totalTime) * 100).toFixed(1),
      db_retrieval_pct: ((dbTime / totalTime) * 100).toFixed(1),
      chunk_selection_pct: ((selectionTime / totalTime) * 100).toFixed(1),
      llm_response_pct: ((llmTime / totalTime) * 100).toFixed(1),
      query_type: queryType,
      chunks_retrieved: searchResults.length,
      chunks_selected: context.length
    }));

    res.json(response);

  } catch (error) {
    console.error('Query error:', error);
    console.error('Error details:', error.response?.data || error.message);
    
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

    // Step 5: Extract text with page information
    console.log(`Processing document ${documentId}: Extracting text with page info...`);
    await DocumentDatabase.logProcessingStep(documentId, 'extraction', 'started');
    
    // Use PageExtractor for enhanced extraction
    const extractionResult = await pageExtractor.extractWithPages(req.file.buffer, req.file.originalname);
    const extractedText = extractionResult.text;
    const pages = extractionResult.pages;
    const sections = pageExtractor.extractSections(extractedText);
    
    console.log('=== ENHANCED EXTRACTION DEBUG ===');
    console.log('Extracted text length:', extractedText.length);
    console.log('Pages found:', pages.length);
    console.log('Sections found:', sections.length);
    console.log('First 100 chars:', extractedText.substring(0, 100));
    console.log('================================');
    
    await DocumentDatabase.logProcessingStep(documentId, 'extraction', 'completed', 
      `Extracted ${extractedText.length} characters, ${pages.length} pages, ${sections.length} sections`);

    // Step 6: Enhanced chunking with LangChain and page tracking
    console.log(`Processing document ${documentId}: Enhanced chunking with page tracking...`);
    await DocumentDatabase.logProcessingStep(documentId, 'chunking', 'started');
    
    const chunks = await enhancedChunker.chunkDocument(extractedText, req.file.originalname);

    console.log('=== ENHANCED CHUNKING DEBUG ===');
    console.log('LangChain chunks created:', chunks.length);
    console.log('First chunk preview:', chunks[0]?.text?.substring(0, 100));
    console.log('First chunk metadata:', chunks[0]?.metadata);
    console.log('================================');

    // Calculate character position for each chunk to determine page number
    let currentPos = 0;
    const enrichedChunks = chunks.map((chunk, index) => {
      // Find which page this chunk belongs to
      const chunkPage = pageExtractor.findPageForChunk(currentPos, pages);
      // Find which section this chunk belongs to
      const chunkSection = pageExtractor.findSectionForPosition(currentPos, sections) || chunk.metadata.section;
      
      const enrichedChunk = {
        doc_id: docId,
        chunk_id: `${docId}_chunk_${index}`,
        text: chunk.text,
        chunk_index: index,
        start_offset: currentPos,
        end_offset: currentPos + chunk.text.length,
        chunk_length: chunk.text.length,
        total_chunks: chunks.length,
        filename: req.file.originalname,
        processed_date: new Date().toISOString(),
        // Enhanced metadata with page and section info
        page_number: chunkPage,
        section: chunkSection,
        doc_type: chunk.metadata.doc_type,
        has_requirements: chunk.metadata.has_requirements
      };
      
      currentPos += chunk.text.length + 2; // Account for chunk separation
      return enrichedChunk;
    });

    console.log('=== ENRICHED CHUNKS DEBUG ===');
    console.log('Enriched chunks count:', enrichedChunks.length);
    console.log('Chunks with sections:', enrichedChunks.filter(c => c.section).length);
    console.log('Chunks with requirements:', enrichedChunks.filter(c => c.has_requirements).length);
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
      // Calculate token count using our standard estimation
      const tokenCount = Math.ceil(chunk.text.length * 0.25);
      
      return {
        chunk_index: chunk.chunk_index,  
        vector_id: vectorPoint ? vectorPoint.id : uuidv4(),  // Use the UUID from vectorPoints
        text: chunk.text,
        chunk_length: chunk.chunk_length,
        start_offset: chunk.start_offset,
        end_offset: chunk.end_offset,
        page_number: chunk.page_number,
        section: chunk.section,
        token_count: tokenCount
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