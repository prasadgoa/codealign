const { Pool } = require('pg');
const crypto = require('crypto');

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'rag_system',
  user: process.env.DB_USER || 'rag_user',
  password: process.env.DB_PASSWORD || 'rag_secure_2025',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Database service functions
class DocumentDatabase {
  
  // Generate SHA-256 hash for file content
  static generateFileHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Check if document already exists by hash
  static async documentExists(fileHash) {
    const query = 'SELECT id, filename FROM documents WHERE file_hash = $1';
    const result = await pool.query(query, [fileHash]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  // Create new document record
  static async createDocument(documentData) {
    const {
      filename,
      originalFilename,
      fileSize,
      mimeType,
      fileHash,
      filePath = null,
      extractedTextLength = null,
      totalPages = null
    } = documentData;

    const query = `
      INSERT INTO documents (
        filename, original_filename, file_size, mime_type, file_hash, file_path,
        extracted_text_length, total_pages, processing_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing')
      RETURNING *
    `;
    
    const values = [filename, originalFilename, fileSize, mimeType, fileHash, filePath, extractedTextLength, totalPages];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Update document processing status
  static async updateDocumentStatus(documentId, status, totalChunks = null) {
    const query = `
      UPDATE documents 
      SET processing_status = $2, total_chunks = COALESCE($3, total_chunks), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [documentId, status, totalChunks]);
    return result.rows[0];
  }

  // Store document chunks - FIXED parameter mapping
  static async storeChunks(documentId, chunks) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const insertQuery = `
        INSERT INTO document_chunks (
          document_id, chunk_index, vector_id, chunk_text, chunk_length,
          page_number, start_offset, end_offset, section, token_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;
      
      for (const chunk of chunks) {
        await client.query(insertQuery, [
          documentId,
          chunk.chunk_index,        // FIXED: was chunk.index, now chunk.chunk_index
          chunk.vector_id,
          chunk.text,
          chunk.chunk_length || chunk.text.length,  // FIXED: use chunk_length if available
          chunk.page_number || null,
          chunk.start_offset || null,
          chunk.end_offset || null,
          chunk.section || null,    // section name if available
          chunk.token_count || Math.ceil(chunk.text.length * 0.25)  // token count with fallback
        ]);
      }
      
      await client.query('COMMIT');
      return chunks.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Get all documents with summary
  static async getDocuments(offset = 0, limit = 50, statusFilter = null) {
    let query = `
      SELECT 
        d.*,
        COUNT(dc.id) as actual_chunks,
        MIN(dc.created_at) as first_chunk_created,
        MAX(dc.created_at) as last_chunk_created
      FROM documents d
      LEFT JOIN document_chunks dc ON d.id = dc.document_id
    `;
    
    const values = [];
    let paramCount = 0;

    if (statusFilter) {
      query += ` WHERE d.processing_status = $${++paramCount}`;
      values.push(statusFilter);
    }

    query += ` 
      GROUP BY d.id
      ORDER BY d.upload_date DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
    values.push(limit, offset);

    const result = await pool.query(query, values);
    return result.rows;
  }

  // Get document by ID with chunks
  static async getDocumentById(documentId) {
    const docQuery = 'SELECT * FROM documents WHERE id = $1';
    const chunksQuery = `
      SELECT chunk_index, vector_id, chunk_length, page_number, start_offset, end_offset
      FROM document_chunks 
      WHERE document_id = $1 
      ORDER BY chunk_index
    `;
    
    const [docResult, chunksResult] = await Promise.all([
      pool.query(docQuery, [documentId]),
      pool.query(chunksQuery, [documentId])
    ]);

    if (docResult.rows.length === 0) {
      return null;
    }

    return {
      ...docResult.rows[0],
      chunks: chunksResult.rows
    };
  }

  // Delete document and all associated data
  static async deleteDocument(documentId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get all vector IDs for this document before deleting
      const vectorQuery = 'SELECT vector_id FROM document_chunks WHERE document_id = $1';
      const vectorResult = await client.query(vectorQuery, [documentId]);
      const vectorIds = vectorResult.rows.map(row => row.vector_id);
      
      // Delete document (cascades to chunks and logs)
      const deleteQuery = 'DELETE FROM documents WHERE id = $1 RETURNING *';
      const result = await client.query(deleteQuery, [documentId]);
      
      await client.query('COMMIT');
      
      return {
        deletedDocument: result.rows[0],
        vectorIds: vectorIds
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Delete all documents and chunks
  static async deleteAllDocuments() {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get all vector IDs before deleting
      const vectorQuery = 'SELECT vector_id FROM document_chunks';
      const vectorResult = await client.query(vectorQuery);
      const vectorIds = vectorResult.rows.map(row => row.vector_id);
      
      // Delete all documents (cascades)
      const deleteQuery = 'DELETE FROM documents';
      await client.query(deleteQuery);
      
      await client.query('COMMIT');
      
      return { vectorIds };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Log processing step
  static async logProcessingStep(documentId, step, status, message = null, processingTime = null) {
    const query = `
      INSERT INTO processing_logs (document_id, step, status, message, processing_time_ms)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(query, [documentId, step, status, message, processingTime]);
    return result.rows[0];
  }

  // Get chunks by vector IDs (for query processing)
  static async getChunksByVectorIds(vectorIds) {
    if (!vectorIds || vectorIds.length === 0) {
      return [];
    }
    
    const placeholders = vectorIds.map((_, index) => `$${index + 1}`).join(',');
    const query = `
      SELECT 
        dc.vector_id,
        dc.chunk_text as text,
        dc.chunk_index,
        dc.page_number,
        dc.section,
        d.original_filename as filename,
        d.id as document_id
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE dc.vector_id IN (${placeholders})
      ORDER BY dc.chunk_index
    `;
    
    const result = await pool.query(query, vectorIds);
    return result.rows;
  }

  // Health check
  static async healthCheck() {
    try {
      const result = await pool.query('SELECT NOW() as timestamp, version() as version');
      return {
        status: 'healthy',
        timestamp: result.rows[0].timestamp,
        version: result.rows[0].version,
        pool_total: pool.totalCount,
        pool_idle: pool.idleCount
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  // Expose pool for direct queries if needed
  static get pool() {
    return pool;
  }
}

module.exports = DocumentDatabase;