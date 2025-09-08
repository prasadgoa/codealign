# RAG Compliance System - Complete Project Documentation

## Project Overview
A Retrieval-Augmented Generation (RAG) system for compliance document processing and intelligent querying. Users upload compliance documents (PDF, DOCX, TXT) which are processed, chunked, embedded, and stored for semantic search-based question answering with source attribution.

Key Features:
- Multi-format document support (PDF, DOCX, TXT)
- Intelligent chunking with page-aware processing
- Cross-encoder reranking for improved retrieval accuracy
- Dynamic chunk selection based on query complexity
- Source attribution with inline citations
- RESTful API for document management and querying

## System Architecture

### Document Processing Pipeline

### Document Upload Pipeline
Express.js endpoint → Apache Tika (text extraction with page detection) → Enhanced chunking (1500 chars with 200 overlap) → TEI embeddings (e5-small-v2) → Qdrant vector storage → PostgreSQL metadata → Response with document ID

### Query Pipeline  
Express.js endpoint → Query classification (definition/specific_section/list/yes_no/general) → TEI embedding → Qdrant vector search (300 candidates) → Cross-encoder reranking (ms-marco-MiniLM) → Dynamic chunk selection (1-15 based on query type) → Prompt generation with labeled sources [A][B][C] → vLLM/Llama 3.1-8B → Citation parsing & mapping → Response with numbered references [1][2][3]

## Infrastructure Setup

### Virtual Machines
1. **rag-vm** (35.209.113.236) - Main processing server
2. **gpt20b** (35.209.219.117) - LLM inference server

### rag-vm Services (35.209.113.236)
- **Express API Server**: Port 3001 (`http://35.209.113.236:3001`) - Main RAG API with all endpoints
- **React Frontend**: Port 3000 (`http://35.209.113.236:3000`) - Document manager and query interface
- **Apache Tika**: Port 9998 (`http://35.209.113.236:9998`) - Document text extraction service
- **TEI Embedding Service**: Port 8081 (Docker: `http://172.17.0.1:8081`) - Text embeddings (e5-small-v2 model)
- **Qdrant Vector DB**: Port 6333 (Docker: `http://172.17.0.1:6333`) - Vector storage and similarity search
- **PostgreSQL**: Port 5433 (Docker container: `postgres-rag`) - Document and chunk metadata
- **Cross-Encoder Service**: In-process with API server - ms-marco-MiniLM reranking model
- **n8n Workflow Engine**: Port 5678 (`http://35.209.113.236:5678`) - Legacy, not actively used

### gpt20b Services (35.209.219.117)
- **vLLM + Llama 3.1-8B-Instruct**: Port 8000 (`http://35.209.219.117:8000`)
  - OpenAI-compatible API endpoint
  - System prompt configured at startup for compliance advisor role
  - Model context: 8192 tokens
  - Temperature: 0.3 for consistent responses

### Networking
- **Docker bridge**: 172.17.0.1 for internal service communication (TEI, Qdrant, PostgreSQL)
- **External API access**: Direct HTTP to service ports
- **Open firewall ports**:
  - 3000: React frontend
  - 3001: Express API server
  - 5433: PostgreSQL (Docker)
  - 5678: n8n workflows (legacy)
  - 6333: Qdrant vector DB
  - 8000: vLLM inference (gpt20b)
  - 8081: TEI embeddings
  - 9998: Apache Tika

## Database Configuration

### PostgreSQL (Container: postgres-rag)
**Connection Details:**
```bash
Host: localhost (from rag-vm) or 35.209.113.236 (external)
Port: 5433
Database: rag_system
User: rag_user
Password: rag_secure_2025
Container: postgres-rag
```

**Database Schema:**

**documents table:**
- `id`: Serial primary key
- `filename`: Original filename (unique constraint)
- `file_hash`: SHA-256 hash for duplicate detection
- `file_size`: Size in bytes
- `mime_type`: Detected MIME type
- `upload_date`: Timestamp of upload
- `processing_status`: 'pending', 'processing', 'completed', 'failed'
- `total_chunks`: Number of chunks created
- `error_message`: Error details if failed
- `metadata`: JSONB for additional properties

**document_chunks table:**
- `id`: Serial primary key
- `document_id`: Foreign key to documents
- `vector_id`: UUID for Qdrant reference
- `chunk_index`: Sequential index within document
- `text`: Full chunk text
- `start_offset`: Character start position
- `end_offset`: Character end position
- `page_number`: Extracted page number (nullable)
- `section`: Extracted section header (nullable)
- `created_at`: Timestamp

**processing_logs table:**
- `id`: Serial primary key
- `document_id`: Foreign key to documents
- `step`: Processing step name
- `status`: 'started', 'completed', 'failed'
- `message`: Log message
- `error_details`: Error information (nullable)
- `started_at`: Step start time
- `completed_at`: Step completion time

**Common Queries:**
```bash
# Connection test:
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "\dt"

# Check documents:
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "SELECT id, filename, processing_status, total_chunks FROM documents ORDER BY upload_date DESC;"

# Check chunk distribution:
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "SELECT document_id, COUNT(*) as chunks, MIN(page_number) as first_page, MAX(page_number) as last_page FROM document_chunks GROUP BY document_id;"

# Clear all data:
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "TRUNCATE processing_logs, document_chunks, documents RESTART IDENTITY CASCADE;"
```

### Qdrant Vector Database
**Configuration:**
```yaml
Collection: compliance_docs
Vector Size: 384 dimensions (e5-small-v2 embeddings)
Distance Metric: Cosine
Storage: In-memory with persistence
Internal URL: http://172.17.0.1:6333
External URL: http://35.209.113.236:6333
```

**Payload Structure:**
```json
{
  "doc_id": "document_uuid",
  "chunk_id": "chunk_uuid", 
  "text": "chunk text content",
  "chunk_index": 0,
  "filename": "document.pdf",
  "db_document_id": 1,
  "page_number": 1,
  "section": "Section 1.2.3"
}
```

**Common Operations:**
```bash
# Collection status:
curl -X GET "http://172.17.0.1:6333/collections/compliance_docs"

# Search test:
curl -X POST "http://172.17.0.1:6333/collections/compliance_docs/points/search" \
  -H "Content-Type: application/json" \
  -d '{"vector": [0.1, 0.2, ...], "limit": 5}'

# Count vectors:
curl -X POST "http://172.17.0.1:6333/collections/compliance_docs/points/count" \
  -H "Content-Type: application/json" \
  -d '{"filter": {}}'

# Recreate collection:
curl -X DELETE "http://172.17.0.1:6333/collections/compliance_docs"
curl -X PUT "http://172.17.0.1:6333/collections/compliance_docs" \
  -H "Content-Type: application/json" \
  -d '{"vectors": {"size": 384, "distance": "Cosine"}}'
```

## Tech Stack

### Core Technologies

#### Backend Services
- **Express.js 4.x** - RESTful API server with comprehensive document management endpoints
- **Node.js 18+** - JavaScript runtime
- **PostgreSQL 15** - Relational database for document metadata and chunk storage
- **Qdrant 1.x** - High-performance vector database for semantic similarity search

#### AI/ML Services
- **Apache Tika 2.x** - Multi-format document text extraction with page detection
- **TEI (Text Embeddings Inference)** - Fast embedding service
  - Model: `e5-small-v2` (384 dimensions)
  - Optimized for semantic search
- **Cross-Encoder Reranking** - Second-stage ranking
  - Model: `ms-marco-MiniLM-L-6-v2`
  - Improves retrieval precision
- **vLLM** - High-throughput LLM inference server
  - Model: `Llama 3.1-8B-Instruct`
  - OpenAI-compatible API
  - Context window: 8192 tokens

#### Frontend
- **React 18** - Component-based UI framework
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Accessible component library
- **Vite** - Fast build tooling

### Supporting Libraries

#### Document Processing
- **multer** - File upload handling
- **uuid** - Unique identifier generation
- **crypto** - SHA-256 hash generation for duplicate detection

#### AI/ML Integration
- **@xenova/transformers** - JavaScript transformers for cross-encoder reranking
- **axios** - HTTP client for service communication

#### Database
- **pg (node-postgres)** - PostgreSQL client
- **Custom DocumentDatabase class** - Abstraction layer for database operations

### Infrastructure & DevOps

#### Containerization
- **Docker** - Service containerization (PostgreSQL, Qdrant, TEI)
- **Docker Compose** - Multi-container orchestration

#### Service Management
- **systemd** - Linux service management
- **systemctl** - Service control interface
- **journalctl** - Service log management

#### Monitoring & Debugging
- **Comprehensive logging** - Timing metrics, chunk selection profiling
- **Health check endpoints** - Service availability monitoring

### Development Tools
- **n8n** - Workflow automation (legacy, being phased out)
- **curl** - API testing
- **jq** - JSON processing

## File Structure

### Source Code (`/home/prasadk/codealign/`)
**Important:** This is where you edit files. Changes must be deployed using:
```bash
sudo cp -r ~/codealign/rag-api/* /opt/rag-api/
sudo systemctl restart rag-api
```

#### Backend Source (`/home/prasadk/codealign/rag-api/`)
```
rag-api/
├── server.js              # Express API server with all endpoints
├── database.js            # DocumentDatabase class for PostgreSQL operations  
├── enhancedChunking.js    # Chunking, reranking, and prompt generation
├── pageExtractor.js       # Page detection and extraction logic
├── package.json           # Node.js dependencies
├── package-lock.json      # Locked dependency versions
└── uploads/               # Temporary file storage during processing
```

#### Frontend Source (`/home/prasadk/codealign/`)
```
├── src/
│   ├── components/
│   │   ├── document-manager.tsx      # Document CRUD UI with file upload
│   │   ├── compliance-checker.tsx    # Query interface with attribution display
│   │   └── ui/                      # shadcn/ui components
│   ├── pages/
│   │   └── Index.tsx                 # Main application page
│   └── lib/
│       └── utils.ts                  # Utility functions
├── public/                           # Static assets
├── dist/                            # Built React app
├── package.json                     # Frontend dependencies
├── tsconfig.json                    # TypeScript configuration
├── tailwind.config.js               # Tailwind CSS configuration
├── vite.config.ts                   # Vite build configuration
└── CLAUDE.md                        # This documentation file
```

### Deployed/Runtime Locations

#### Backend Deployment (`/opt/rag-api/`)
```
/opt/rag-api/                        # DEPLOYED VERSION - DO NOT EDIT DIRECTLY
├── server.js                        # Running API server
├── database.js                      # Database operations
├── enhancedChunking.js             # Chunking and reranking
├── pageExtractor.js                # Page extraction
├── package.json                    
├── node_modules/                    # Installed dependencies
└── uploads/                         # Document upload directory
```

#### Frontend Deployment
```
/home/prasadk/codealign/dist/        # Built React app served on port 3000
```

#### Service Configuration
```
/etc/systemd/system/rag-api.service  # systemd service definition
```

#### Database Files
```
Docker volumes:
- PostgreSQL data: /var/lib/docker/volumes/postgres-rag-data
- Qdrant data: /var/lib/docker/volumes/qdrant-storage
```

### Legacy/Archived
```
/home/prasadk/codealign/workflows/   # n8n workflow definitions (not actively used)
├── upload-document-workflow.json
└── query-compliance-workflow.json
```

### Important Notes
1. **Always edit source files** in `/home/prasadk/codealign/rag-api/`
2. **Deploy changes** with: `sudo cp -r ~/codealign/rag-api/* /opt/rag-api/`
3. **Restart service** after deployment: `sudo systemctl restart rag-api`
4. **Frontend auto-builds** from source location
5. **Never edit** files directly in `/opt/rag-api/`

## Current Implementation Status

### Phase 1: Core Infrastructure - COMPLETE ✅
- PostgreSQL database with full schema
- Qdrant vector database configured
- Express.js API server operational
- React frontend with document manager
- Docker services running (PostgreSQL, Qdrant, TEI)
- vLLM inference server on separate VM

### Phase 2: Document Processing - COMPLETE ✅
- Multi-format support (PDF, DOCX, TXT)
- Apache Tika text extraction with page detection
- Enhanced chunking (1500 chars, 200 overlap)
- TEI embedding generation (e5-small-v2)
- Duplicate detection via SHA-256 hashing
- Metadata extraction (sections, page numbers)

### Phase 3: Advanced Retrieval - COMPLETE ✅
- Query classification (5 types: definition, specific_section, list, yes_no, general)
- Vector search with 300 candidate retrieval
- Cross-encoder reranking (ms-marco-MiniLM-L-6-v2)
- Hybrid vector-first selection algorithm
- Dynamic chunk selection (1-15 chunks based on query type)
- Token budget management

### Phase 4: Answer Generation - COMPLETE ✅
- vLLM/Llama 3.1-8B integration
- System prompt configuration for compliance advisor
- Labeled source context [A][B][C]
- Citation parsing and mapping to [1][2][3]
- Source attribution with document references
- LLM health checks for availability

### Phase 5: Quality Optimizations - COMPLETE ✅
- Increased retrieval limit for comprehensive coverage
- Adaptive quality gates in chunk selection
- Performance profiling and timing metrics
- Improved prompt engineering for citation compliance

### Known Issues & Future Improvements

#### To Fix:
- Remove temporary prompt logging from server.js
- System prompt on vLLM needs stricter citation format enforcement

#### Future Enhancements:
- Query expansion for semantic gap issues (e.g., "fire" vs "incident")
- Hybrid keyword + vector search
- Caching layer for frequently accessed chunks
- Admin dashboard for system monitoring
- Batch document upload support
- Export query results to PDF/Word
- User authentication and multi-tenancy

## API Endpoints

### Base URL
```
http://35.209.113.236:3001/api
```

### Health & Status

#### GET `/api/health`
Health check endpoint for service monitoring
```bash
curl -X GET "http://35.209.113.236:3001/api/health"
```
**Response:**
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "qdrant": "connected",
    "tika": "available",
    "tei": "available",
    "llm": "available"
  }
}
```

### Document Management

#### GET `/api/documents`
List all documents with metadata
```bash
curl -X GET "http://35.209.113.236:3001/api/documents"
```
**Response:**
```json
{
  "success": true,
  "documents": [
    {
      "id": 1,
      "filename": "NFPA_101.pdf",
      "file_size": 2048576,
      "upload_date": "2024-01-15T10:30:00Z",
      "processing_status": "completed",
      "total_chunks": 450
    }
  ]
}
```

#### GET `/api/documents/:id`
Get specific document details
```bash
curl -X GET "http://35.209.113.236:3001/api/documents/1"
```

#### DELETE `/api/documents/:id`
Delete a specific document and its chunks
```bash
curl -X DELETE "http://35.209.113.236:3001/api/documents/1"
```

#### DELETE `/api/documents`
Delete all documents (requires confirmation)
```bash
curl -X DELETE "http://35.209.113.236:3001/api/documents" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

### Document Upload

#### POST `/api/upload-document-direct`
Upload and process a document
```bash
curl -X POST "http://35.209.113.236:3001/api/upload-document-direct" \
  -F "file=@/path/to/document.pdf"
```
**Supported formats:** PDF, DOCX, TXT  
**Max file size:** 50MB  
**Response:**
```json
{
  "success": true,
  "message": "Document processed successfully",
  "document": {
    "id": 1,
    "filename": "document.pdf",
    "total_chunks": 45,
    "processing_time_ms": 12500
  }
}
```

### Query & Retrieval

#### POST `/api/query`
Query the knowledge base with semantic search and LLM generation
```bash
curl -X POST "http://35.209.113.236:3001/api/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the fire sprinkler requirements?"}'
```
**Request:**
```json
{
  "query": "your question here",
  "max_chunks": 10,  // optional, default based on query type
  "include_sources": true  // optional, default true
}
```
**Response:**
```json
{
  "success": true,
  "query": "What are the fire sprinkler requirements?",
  "query_type": "general",
  "answer": "Fire sprinkler requirements include... [1] [2]",
  "chunks_analyzed": 300,
  "chunks_used": 8,
  "sources": [
    {
      "reference": "[1]",
      "document": "NFPA_13.pdf",
      "page": 45,
      "section": "4.2.1",
      "relevance": "95.2%",
      "excerpt": "Sprinkler systems shall be..."
    }
  ],
  "enhancement_info": {
    "llm_guided_attribution": true,
    "natural_language_format": true,
    "temperature": 0.3
  },
  "timing": {
    "total_ms": 8500,
    "embedding_ms": 50,
    "search_ms": 120,
    "rerank_ms": 450,
    "llm_ms": 7500
  }
}
```

### Deprecated/Legacy Endpoints

#### n8n Webhooks (Not Recommended)
```bash
# Upload workflow (deprecated - use direct upload instead)
POST http://35.209.113.236:5678/webhook-test/upload-document

# Query workflow (deprecated - use /api/query instead)  
POST http://35.209.113.236:5678/webhook/d9ece4d6-a9da-494b-bb03-caba40eae672
```

### Error Responses

All endpoints return consistent error formats:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error information",
  "code": "ERROR_CODE"
}
```

**Common error codes:**
- `DUPLICATE_FILE`: File already exists
- `PROCESSING_FAILED`: Document processing error
- `LLM_UNAVAILABLE`: LLM service temporarily unavailable
- `INVALID_FORMAT`: Unsupported file format
- `FILE_TOO_LARGE`: File exceeds size limit

## Service Management Commands

### API Server Management

#### Service Control
```bash
# Start/Stop/Restart API server
sudo systemctl start rag-api
sudo systemctl stop rag-api
sudo systemctl restart rag-api

# Check service status
sudo systemctl status rag-api

# Enable/Disable auto-start on boot
sudo systemctl enable rag-api
sudo systemctl disable rag-api

# Reload systemd after service file changes
sudo systemctl daemon-reload
```

#### Deployment Workflow
```bash
# 1. Edit source files
cd ~/codealign/rag-api/
vim server.js

# 2. Deploy to production
sudo cp -r ~/codealign/rag-api/* /opt/rag-api/

# 3. Restart service
sudo systemctl restart rag-api

# 4. Verify deployment
sudo systemctl status rag-api
curl -X GET "http://localhost:3001/api/health"
```

#### Log Management
```bash
# View real-time logs
sudo journalctl -u rag-api -f

# View last 100 lines
sudo journalctl -u rag-api -n 100

# View logs since last restart
sudo journalctl -u rag-api --since "$(systemctl show -p ActiveEnterTimestamp rag-api | cut -d= -f2-)"

# Search logs for errors
sudo journalctl -u rag-api | grep -i error

# Export logs to file
sudo journalctl -u rag-api --since "1 hour ago" > ~/rag-api-logs.txt
```

### Docker Container Management

#### Container Operations
```bash
# List all containers
docker ps -a

# Start/Stop containers
docker start postgres-rag
docker stop postgres-rag

# Restart containers
docker restart postgres-rag

# View container logs
docker logs postgres-rag --tail 50 -f
docker logs qdrant --tail 50 -f

# Execute commands in container
docker exec -it postgres-rag bash
docker exec -it qdrant bash

# Container resource usage
docker stats postgres-rag qdrant
```

### PostgreSQL Database Operations

#### Connection & Access
```bash
# Interactive PostgreSQL shell
docker exec -it postgres-rag psql -U rag_user -d rag_system

# Execute single command
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "SELECT COUNT(*) FROM documents;"

# Execute SQL file
docker exec -i postgres-rag psql -U rag_user -d rag_system < ~/schema.sql
```

#### Data Queries
```bash
# Document status overview
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "
  SELECT processing_status, COUNT(*) as count 
  FROM documents 
  GROUP BY processing_status;"

# Recent documents
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "
  SELECT id, filename, upload_date, processing_status, total_chunks 
  FROM documents 
  ORDER BY upload_date DESC 
  LIMIT 10;"

# Chunk statistics
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "
  SELECT d.filename, COUNT(c.id) as chunks, 
    MIN(c.page_number) as first_page, 
    MAX(c.page_number) as last_page 
  FROM documents d 
  JOIN document_chunks c ON d.id = c.document_id 
  GROUP BY d.id, d.filename;"

# Processing errors
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "
  SELECT d.filename, p.step, p.error_details 
  FROM processing_logs p 
  JOIN documents d ON p.document_id = d.id 
  WHERE p.status = 'failed';"
```

#### Data Maintenance
```bash
# Clear all data (CAUTION!)
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "
  TRUNCATE processing_logs, document_chunks, documents RESTART IDENTITY CASCADE;"

# Delete specific document
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "
  DELETE FROM documents WHERE id = 1;"

# Vacuum database (optimize storage)
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "VACUUM ANALYZE;"

# Database backup
docker exec postgres-rag pg_dump -U rag_user rag_system > ~/rag_backup_$(date +%Y%m%d).sql

# Database restore
docker exec -i postgres-rag psql -U rag_user -d rag_system < ~/rag_backup.sql
```

### Qdrant Vector Database Operations

#### Collection Management
```bash
# Check collection status
curl -X GET "http://172.17.0.1:6333/collections/compliance_docs"

# Get collection info
curl -X GET "http://172.17.0.1:6333/collections/compliance_docs/info"

# Count vectors
curl -X POST "http://172.17.0.1:6333/collections/compliance_docs/points/count" \
  -H "Content-Type: application/json" \
  -d '{}'

# Delete and recreate collection
curl -X DELETE "http://172.17.0.1:6333/collections/compliance_docs"
curl -X PUT "http://172.17.0.1:6333/collections/compliance_docs" \
  -H "Content-Type: application/json" \
  -d '{"vectors": {"size": 384, "distance": "Cosine"}}'
```

#### Vector Operations
```bash
# Search vectors
curl -X POST "http://172.17.0.1:6333/collections/compliance_docs/points/search" \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, ...],  # 384 dimensions
    "limit": 5,
    "with_payload": true
  }'

# Delete specific vectors
curl -X POST "http://172.17.0.1:6333/collections/compliance_docs/points/delete" \
  -H "Content-Type: application/json" \
  -d '{"points": ["vector-id-1", "vector-id-2"]}'

# Backup collection
curl -X POST "http://172.17.0.1:6333/collections/compliance_docs/snapshots"
```

### Process Monitoring

#### System Resources
```bash
# CPU and memory usage
htop

# Disk usage
df -h

# Port usage
sudo netstat -tulpn | grep -E '3000|3001|5433|6333|8000|8081|9998'

# Process monitoring
ps aux | grep -E 'node|docker|postgres|qdrant'
```

#### Service Health Checks
```bash
# Check all services
for port in 3001 5433 6333 8081 9998; do
  echo "Checking port $port..."
  nc -zv localhost $port
done

# Test LLM service
curl -X GET "http://35.209.219.117:8000/health"

# Test full pipeline
curl -X POST "http://localhost:3001/api/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "test query"}'
```

### Troubleshooting

#### Common Issues
```bash
# Port already in use
sudo lsof -i :3001
sudo kill -9 [PID]

# Clear Docker issues
docker system prune -a --volumes

# Reset database connection
docker restart postgres-rag
sudo systemctl restart rag-api

# Check disk space
df -h /var/lib/docker

# View systemd service file
cat /etc/systemd/system/rag-api.service
```



## Key Test Commands

### Quick System Validation

#### Full Pipeline Test
```bash
# 1. Create test file
echo "This is a test document about fire safety regulations." > /tmp/test-doc.txt

# 2. Upload document
curl -X POST -F "file=@/tmp/test-doc.txt" \
  http://localhost:3001/api/upload-document-direct

# 3. Query the document
curl -X POST "http://localhost:3001/api/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "What does the document say about fire safety?"}'

# 4. Check attribution
# Response should include answer with [1] citations and source references
```

#### Service Health Matrix
```bash
# Check all services in one command
echo "=== Service Health Check ===" && \
echo "API Server:" && curl -s http://localhost:3001/api/health | jq '.status' && \
echo "PostgreSQL:" && docker exec postgres-rag pg_isready && \
echo "Qdrant:" && curl -s http://172.17.0.1:6333/collections/compliance_docs | jq '.status' && \
echo "Tika:" && curl -s http://localhost:9998/tika | grep -q "Apache Tika" && echo "OK" && \
echo "TEI:" && curl -s http://172.17.0.1:8081/health | jq '.status' && \
echo "LLM:" && curl -s http://35.209.219.117:8000/health | jq '.'
```

### Component Testing

#### Document Upload Tests
```bash
# Test duplicate detection
curl -X POST -F "file=@/tmp/test-doc.txt" \
  http://localhost:3001/api/upload-document-direct
# Should return duplicate error

# Test PDF upload
curl -X POST -F "file=@/path/to/document.pdf" \
  http://localhost:3001/api/upload-document-direct

# Test DOCX upload
curl -X POST -F "file=@/path/to/document.docx" \
  http://localhost:3001/api/upload-document-direct

# Test invalid format
echo "test" > /tmp/test.xyz
curl -X POST -F "file=@/tmp/test.xyz" \
  http://localhost:3001/api/upload-document-direct
# Should return format error
```

#### Query Testing
```bash
# Test different query types

# Definition query
curl -X POST "http://localhost:3001/api/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is a fire sprinkler?"}'

# Specific section query  
curl -X POST "http://localhost:3001/api/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "Section 4.2.1 requirements"}'

# List query
curl -X POST "http://localhost:3001/api/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "List all occupancy classifications"}'

# Yes/No query
curl -X POST "http://localhost:3001/api/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "Are sprinklers required in restaurants?"}'

# Complex general query
curl -X POST "http://localhost:3001/api/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "Explain the fire safety requirements for a 3-story office building with assembly areas"}'
```

#### Individual Service Tests
```bash
# Apache Tika - Text extraction
curl -X POST -F "file=@/tmp/test.pdf" \
  http://localhost:9998/tika/form \
  -H "Accept: text/plain"

# TEI - Embedding generation
curl -X POST "http://172.17.0.1:8081/embed" \
  -H "Content-Type: application/json" \
  -d '{"inputs": "Fire safety regulations", "truncate": true}'

# Qdrant - Vector search
curl -X POST "http://172.17.0.1:6333/collections/compliance_docs/points/search" \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, 0.3, ...],  # 384 dimensions
    "limit": 5,
    "with_payload": true
  }'

# vLLM - Direct LLM query
curl -X POST "http://35.209.219.117:8000/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b-instruct",
    "messages": [
      {"role": "user", "content": "Test message"}
    ],
    "max_tokens": 50
  }'
```

### Performance Testing

#### Response Time Measurement
```bash
# Measure query response time
time curl -X POST "http://localhost:3001/api/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "What are fire sprinkler requirements?"}'

# Measure with detailed timing
curl -w "\n\nTime Details:\n  DNS: %{time_namelookup}s\n  Connect: %{time_connect}s\n  Start Transfer: %{time_starttransfer}s\n  Total: %{time_total}s\n" \
  -X POST "http://localhost:3001/api/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "What are fire sprinkler requirements?"}'
```

#### Load Testing
```bash
# Simple concurrent request test
for i in {1..10}; do
  curl -X POST "http://localhost:3001/api/query" \
    -H "Content-Type: application/json" \
    -d '{"query": "Test query '$i'"}' &
done
wait

# Monitor system during load
htop  # In another terminal
docker stats  # In another terminal
```

### Debugging Commands

#### Check Recent Logs
```bash
# API server logs with timing
sudo journalctl -u rag-api --since "5 minutes ago" | grep -E "TIMING|ERROR|WARN"

# Check for citation issues
sudo journalctl -u rag-api --since "10 minutes ago" | grep -E "CITATION|sources"

# Check chunk selection
sudo journalctl -u rag-api --since "10 minutes ago" | grep "CHUNK_SELECTION"
```

#### Database Verification
```bash
# Verify document processing
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "
  SELECT d.filename, d.processing_status, d.total_chunks,
    (SELECT COUNT(*) FROM document_chunks WHERE document_id = d.id) as actual_chunks
  FROM documents d
  ORDER BY d.upload_date DESC LIMIT 5;"

# Check for orphaned chunks
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "
  SELECT COUNT(*) as orphaned_chunks
  FROM document_chunks c
  LEFT JOIN documents d ON c.document_id = d.id
  WHERE d.id IS NULL;"
```

### Test Data

#### Sample Test Files
```bash
# Create small test file
echo "Fire sprinklers must be installed in all commercial buildings over 5000 square feet." > /tmp/test-fire.txt

# Create multi-line test file
cat > /tmp/test-building.txt << EOF
Building Code Requirements:
1. All exits must be clearly marked
2. Fire alarms required on every floor
3. Sprinkler systems mandatory for buildings over 3 stories
4. Emergency lighting must operate for minimum 90 minutes
EOF

# Test files available in system
ls -la /tmp/*.txt /tmp/*.pdf 2>/dev/null
```

## Special Instructions

### Deployment Reminder
```bash
# ALWAYS deploy changes using this workflow:
# 1. Edit source files
cd ~/codealign/rag-api/

# 2. Deploy to production
sudo cp -r ~/codealign/rag-api/* /opt/rag-api/

# 3. Restart service
sudo systemctl restart rag-api

# 4. Verify deployment
sudo systemctl status rag-api
```

## Important Notes
1. **Source directory**: `~/codealign/rag-api/` (edit here)
2. **Deploy directory**: `/opt/rag-api/` (DO NOT edit directly)
3. **Don't kill active shell**: Avoid `kill -9` on current process
4. **Stick to agreed plans**: Consult before changing approach

