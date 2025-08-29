-- Document tracking schema for RAG system

-- Documents table - stores document metadata
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_status VARCHAR(50) DEFAULT 'processing',
    total_chunks INTEGER DEFAULT 0,
    total_pages INTEGER,
    file_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash to prevent duplicates
    extracted_text_length INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document chunks table - stores chunk metadata
CREATE TABLE document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL, -- Order within document
    vector_id VARCHAR(255) NOT NULL, -- Qdrant point ID
    chunk_text TEXT NOT NULL,
    chunk_length INTEGER NOT NULL,
    page_number INTEGER,
    start_offset INTEGER, -- Character position in original document
    end_offset INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(document_id, chunk_index),
    UNIQUE(vector_id)
);

-- Processing logs table - tracks document processing steps
CREATE TABLE processing_logs (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    step VARCHAR(50) NOT NULL, -- 'upload', 'extraction', 'chunking', 'embedding', 'storage'
    status VARCHAR(50) NOT NULL, -- 'started', 'completed', 'failed'
    message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_documents_status ON documents(processing_status);
CREATE INDEX idx_documents_upload_date ON documents(upload_date);
CREATE INDEX idx_documents_filename ON documents(filename);
CREATE INDEX idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_chunks_vector_id ON document_chunks(vector_id);
CREATE INDEX idx_processing_logs_document_id ON processing_logs(document_id);

-- Function to update document updated_at timestamp
CREATE OR REPLACE FUNCTION update_document_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update timestamps
CREATE TRIGGER update_documents_timestamp
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_document_timestamp();

-- View for document summary with chunk counts
CREATE VIEW document_summary AS
SELECT 
    d.*,
    COUNT(dc.id) as actual_chunks,
    MIN(dc.created_at) as first_chunk_created,
    MAX(dc.created_at) as last_chunk_created
FROM documents d
LEFT JOIN document_chunks dc ON d.id = dc.document_id
GROUP BY d.id;

-- Function to get documents with pagination
CREATE OR REPLACE FUNCTION get_documents_paginated(
    page_offset INTEGER DEFAULT 0,
    page_limit INTEGER DEFAULT 10,
    status_filter VARCHAR DEFAULT NULL
)
RETURNS TABLE(
    id INTEGER,
    filename VARCHAR,
    file_size BIGINT,
    upload_date TIMESTAMP WITH TIME ZONE,
    processing_status VARCHAR,
    total_chunks INTEGER,
    actual_chunks BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ds.id,
        ds.filename,
        ds.file_size,
        ds.upload_date,
        ds.processing_status,
        ds.total_chunks,
        ds.actual_chunks
    FROM document_summary ds
    WHERE (status_filter IS NULL OR ds.processing_status = status_filter)
    ORDER BY ds.upload_date DESC
    LIMIT page_limit OFFSET page_offset;
END;
$$ LANGUAGE plpgsql;
