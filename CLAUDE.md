# Marshal Fire Department Management System

## Project Overview
**Marshal** is a fire department management platform with three modules: **Dashboard** (coming soon), **Knowledge Base** (active), and **Reports** (coming soon). The Knowledge Base features a RAG system for compliance document processing and AI-powered querying of fire safety and building codes.

**Current Status**: Knowledge Base fully operational with document upload, AI assistant, semantic search, and source attribution. Dashboard and Reports modules show professional "coming soon" placeholders.

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
- **React Frontend**: Port 3000 (`http://35.209.113.236:3000`) - Marshal Fire Department Management System with three-module architecture
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


## Deployment Workflow

### Source → Production
1. **Edit source files** in `/home/prasadk/codealign/rag-api/`
2. **Deploy to production**: `sudo cp -r ~/codealign/rag-api/* /opt/rag-api/`
3. **Restart service**: `sudo systemctl restart rag-api`
4. **Frontend auto-builds** from source location

### Key Locations
- **Source**: `/home/prasadk/codealign/rag-api/` (edit here)
- **Production**: `/opt/rag-api/` (deployed, don't edit directly)
- **Frontend**: `/home/prasadk/codealign/dist/` (built Marshal UI)
- **Service Config**: `/etc/systemd/system/rag-api.service`


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

## Document Archiving System

### Overview
The system includes a comprehensive document archiving feature that allows users to remove documents from AI search while keeping them available for reference.

### Database Schema (Added)
- **status** column: `'active'` | `'archived'` (with check constraint)
- **archived_date** timestamp: When document was archived
- **Unique filename constraint**: Only applies to active documents (allows version management)

### API Endpoints
```bash
# Archive a document (removes from search, keeps file)
POST /api/documents/:id/archive

# Restore an archived document (triggers reprocessing)
POST /api/documents/:id/restore

# List documents with status filter
GET /api/documents?status=active|archived|all
```

### Frontend Features
- **Status filter dropdown**: Active (default) | All | Archived
- **Clickable status badges**: Click to archive/restore with confirmation
- **Visual indicators**: Active (green), Archived (gray) with archive date
- **Smart filename validation**: Prevents conflicts among active documents only

### User Workflow
1. **Active documents**: Searchable by AI, included in queries
2. **Archive**: Removes from search, keeps for view/download
3. **Restore**: Reprocesses and adds back to search
4. **Version management**: Upload new file with same name after archiving old version

## Frontend Configuration System

### Branding Configuration
Location: `/src/config/branding.ts`

```typescript
export const defaultBranding = {
  appName: "Marshal",
  assistantName: "Marshal", 
  documentLibraryName: "Knowledge Base",
  tagline: "Compliance Command Center",
  promptDescription: "Ask me anything about fire safety...",
  primaryDomain: "fire safety"
};
```

Components using branding config:
- Header: App name, tagline, navigation labels
- Knowledge Base: Headings, assistant name, prompts
- Compliance Checker: Assistant references, descriptions

### Color System
- **CSS Variables**: `/src/index.css` with HSL values for theme consistency
- **Logo Colors**: Hardcoded Tailwind classes in header component
- **Navigation**: Hardcoded red accent colors
- **Buttons**: Use CSS variable system (primary/accent gradients)

## Development Workflow

### Frontend Changes (UI, Styles, Components)
```bash
# Fast deployment - UI changes only
npm run build
# Changes are live immediately - no service restart needed
```

### Backend Changes (API, Database, Server Logic)
```bash
# Full deployment - server changes
sudo cp -r ~/codealign/rag-api/* /opt/rag-api/
sudo systemctl restart rag-api
sudo systemctl status rag-api
```

**IMPORTANT**: Use the appropriate workflow - don't waste time with full deployment for pure UI changes.

### File Structure
- **Source directory**: `~/codealign/` (edit here)
- **Backend source**: `~/codealign/rag-api/` 
- **Frontend source**: `~/codealign/src/`
- **Built frontend**: `~/codealign/dist/` (served directly)
- **Production backend**: `/opt/rag-api/` (deployed, don't edit directly)

## Color Configuration System

### Overview
The Marshal Fire Department system uses a comprehensive color configuration system that allows easy customization of all UI colors through a centralized configuration file. All colors are organized by functional areas and support multiple themes.

**IMPORTANT FOR CLAUDE**: When asked to modify colors, always follow the **5-Color Architecture Framework** documented below. Present options that adhere to this professional design system.

### Configuration Files
- **Color Config**: `/src/config/colors.ts` - Main color configuration with predefined themes
- **Branding Config**: `/src/config/branding.ts` - Text and branding configuration

## **5-Color Architecture Framework** 🎨

### **Professional Design System (MUST FOLLOW)**

This system uses **exactly 5 core colors** for optimal visual hierarchy, professional appearance, and brand consistency. When creating new themes or modifying colors, strictly adhere to this architecture.

#### **Color Architecture:**

**1. PRIMARY Brand Color** ⭐
- **Purpose**: Main brand identity and primary actions
- **Elements**: Logo main, primary buttons, active navigation links, key highlights
- **Rule**: ALL these elements MUST use the same color for brand consistency

**2. SECONDARY Accent Color** 🎯  
- **Purpose**: Supporting brand elements and secondary actions
- **Elements**: Logo shields/badges, secondary buttons, warning states, important highlights
- **Rule**: Provides visual interest while maintaining clear hierarchy from primary

**3. SUCCESS/STATUS Color** ✅
- **Purpose**: Positive feedback and active states
- **Elements**: Success messages, active status badges, confirmations, positive indicators
- **Rule**: ALL positive status elements must share this color for consistency

**4. NEUTRAL Base Color** ⚪
- **Purpose**: Clean, professional foundation
- **Elements**: All backgrounds, light text on dark elements, clean spaces
- **Rule**: Creates cohesive, uncluttered appearance

**5. NEUTRAL Text/Border System** ⚫
- **Purpose**: Content hierarchy and structure  
- **Elements**: All text (various weights), borders, dividers, inactive states, secondary backgrounds
- **Rule**: Single color family with opacity/weight variations for hierarchy

#### **Color Sharing Rules:**

**✅ MUST Share Color (Collapse):**
- Logo + Primary Buttons + Active Nav = **PRIMARY COLOR**
- All Success States + Active Badges = **SUCCESS COLOR**  
- All Backgrounds + Clean Spaces = **NEUTRAL BASE**
- All Text + All Borders = **NEUTRAL SYSTEM** (opacity variations)

**❌ MUST Separate (Different Colors):**
- Primary vs Secondary importance levels
- Success vs Warning vs Error states  
- Brand elements vs Content elements
- Active vs Inactive states

#### **Benefits of 5-Color System:**
- **Professional appearance** - Not overwhelming, maintains authority
- **Clear hierarchy** - Each color has distinct functional purpose
- **Brand consistency** - Consolidated color usage strengthens identity
- **Scalable design** - Works for simple and complex interfaces
- **Accessible** - Sufficient contrast options without confusion

### **Implementation for New Themes:**

When creating themes for different customers (fire, police, medical, corporate), follow this process:

1. **Choose PRIMARY color** based on industry standards
2. **Select SECONDARY accent** that complements primary (often metallic: gold, silver, bronze)
3. **Define SUCCESS color** (typically green, but can be industry-appropriate)
4. **Set NEUTRAL base** (usually white or very light gray)
5. **Configure NEUTRAL text system** (gray family with consistent relationships)

### Available Color Themes

#### Fire Theme (Default)
- **Logo**: Red gradient with amber shield accent
- **Navigation**: Red active links, gray inactive
- **Status Badges**: Green for active, gray for archived
- **Coming Soon Sections**: Light green background
- **Error Sections**: Light red background

#### Police Theme
- **Logo**: Blue gradient with yellow shield accent  
- **Navigation**: Blue active links
- **Status Badges**: Blue for active, slate for archived
- **Coming Soon Sections**: Light blue background
- **Error Sections**: Light red background

#### Medical/EMS Theme
- **Logo**: Red gradient with white shield accent
- **Navigation**: Red active links
- **Status Badges**: Green for active, gray for archived
- **Coming Soon Sections**: Light green background
- **Error Sections**: Light red background

### Color Categories

#### 1. Logo and Branding Colors
```typescript
logo: {
  primary: string;        // Main logo background gradient start
  primaryEnd: string;     // Main logo background gradient end
  secondary: string;      // Shield/badge background gradient start
  secondaryEnd: string;   // Shield/badge background gradient end
  icon: string;          // Icon color inside logo
}
```

#### 2. Navigation and Header Colors
```typescript
navigation: {
  background: string;     // Header background
  border: string;        // Header border
  titleText: string;     // App title color
  taglineText: string;   // Tagline color
  companyText: string;   // Company name color
  linkInactive: string;  // Inactive nav links
  linkActive: string;    // Active/hover nav links
  activeBorder: string;  // Active tab border
}
```

#### 3. Status Badge Colors
```typescript
statusBadges: {
  active: {
    background: string;   // Active document badge background
    text: string;        // Active document badge text
    hover: string;       // Active badge hover state
  };
  archived: {
    background: string;  // Archived document badge background
    text: string;        // Archived document badge text
    hover: string;       // Archived badge hover state
  };
}
```

#### 4. Section-specific Colors
```typescript
sections: {
  comingSoon: {
    background: string;   // Coming soon section background
    border: string;       // Coming soon section border
    titleText: string;    // Coming soon title
    bodyText: string;     // Coming soon description
  };
  error: {
    background: string;   // Error message background
    border: string;       // Error message border
    titleText: string;    // Error title text
    bodyText: string;     // Error body text
  };
}
```

#### 5. Footer Colors
```typescript
footer: {
  background: string;     // Footer background
  border: string;        // Footer border
  text: string;          // Footer text
  companyHighlight: string; // Company name highlight
}
```

### **How Claude Should Present Color Options** 🤖

**IMPORTANT**: When user requests color changes, ALWAYS:

1. **Present 3-4 Complete Theme Options** following the 5-Color Architecture
2. **Show each option as:**
   ```
   ## Option 1: [Industry Name] Theme
   - PRIMARY: [Color] - Logo, primary buttons, active nav
   - SECONDARY: [Color] - Logo accents, secondary actions  
   - SUCCESS: [Color] - Active badges, success states
   - NEUTRAL BASE: [Color] - All backgrounds
   - NEUTRAL SYSTEM: [Gray family] - Text and borders
   
   **Best for**: [Industry/use case]
   **Mood**: [Professional descriptor]
   ```

3. **Ask user to select preferred option** before implementing
4. **Explain why each option follows professional design principles**
5. **Show visual hierarchy example** for selected option

**Example Response Format:**
"Based on your requirements, here are 3 professionally-designed color options following our 5-Color Architecture Framework:"

[Present options as above]

"Which option appeals to you most? I'll then implement the complete theme while maintaining our design system's consistency rules."

### How to Change Colors ⚠️ **CRITICAL IMPLEMENTATION NOTES**

**🔥 IMPORTANT**: The color architecture has **TWO SYSTEMS** that must work together:

1. **Component Colors** (`/src/config/colors.ts`) - Logo, navigation, specific elements
2. **CSS Variables** (`/src/index.css`) - Primary buttons, gradients, shadcn/ui components

**Both must be updated together** for logo and buttons to match with gradations!

#### Method 1: Switch to Existing Theme
1. Edit `/src/config/colors.ts`
2. Modify the default theme in `getColorConfig()`:
```typescript
export const getColorConfig = (themeName: ThemeName = 'police'): ColorConfig => {
  return colorThemes[themeName];
};
```
3. **CRITICAL**: Update CSS variables in `/src/index.css` to match:
```css
--primary: [HSL_VALUES];        // Convert rgb() to HSL
--primary-glow: [HSL_VALUES];   // Lighter version for gradients
--accent: [HSL_VALUES];         // Same as primary
--accent-glow: [HSL_VALUES];    // Same as primary-glow
```
4. Run `npm run build` to apply changes

#### Method 2: Customize Individual Colors  
1. **Step A**: Edit `/src/config/colors.ts`
```typescript
export const fireTheme: ColorConfig = {
  logo: {
    primary: "rgb(153, 27, 27)",        // Burgundy - PRIMARY color
    primaryEnd: "rgb(127, 29, 29)",     // Darker burgundy for gradient
    secondary: "rgb(245, 158, 11)",     // Gold - SECONDARY color
    // ... other colors
  },
  navigation: {
    companyText: "rgb(153, 27, 27)",    // MUST match logo primary
    linkActive: "rgb(153, 27, 27)",     // MUST match logo primary
    activeBorder: "rgb(153, 27, 27)",   // MUST match logo primary
  },
  footer: {
    companyHighlight: "rgb(153, 27, 27)", // MUST match logo primary
  }
  // ... other sections
};
```

2. **Step B**: Edit `/src/index.css` CSS variables to match PRIMARY color:
```css
/* Light mode */
--primary: 0 70% 35%;           // rgb(153,27,27) converted to HSL
--primary-glow: 0 70% 50%;      // Lighter for gradient effect
--accent: 0 70% 35%;            // Same as primary
--accent-glow: 0 70% 50%;       // Same as primary-glow

/* Dark mode */  
--primary: 0 70% 45%;           // Slightly lighter for dark mode
--primary-glow: 0 70% 60%;      // Lighter for gradient effect
--accent: 0 70% 45%;            // Same as primary
--accent-glow: 0 70% 60%;       // Same as primary-glow
```

3. Run `npm run build` to apply changes

#### **Color Conversion Tool** (RGB to HSL):
When changing PRIMARY color, convert rgb() values to HSL for CSS variables:
- **RGB(153, 27, 27)** = **HSL(0, 70%, 35%)**
- **RGB(220, 38, 38)** = **HSL(0, 82%, 51%)**  
- **RGB(185, 28, 28)** = **HSL(0, 74%, 42%)**

**For gradients**: Make `-glow` version 10-15% higher lightness than base

#### Method 3: Create New Theme
1. Add new theme to `/src/config/colors.ts`:
```typescript
export const customTheme: ColorConfig = {
  // Define all color categories here
};

export const colorThemes = {
  fire: fireTheme,
  police: policeTheme,
  medical: medicalTheme,
  custom: customTheme,  // Add your theme
} as const;
```
2. Update theme selection in `getColorConfig()`
3. Run `npm run build` to apply changes

### Color Format Guidelines
- Use **RGB values** for consistency: `rgb(255, 0, 0)`
- Use **HSL values** for CSS variables: `hsl(0, 100%, 50%)`
- Avoid hex codes to maintain consistency
- Test colors for sufficient contrast (WCAG AA compliance)

### Component Integration
All major components now use the color configuration system:
- **Header**: Logo, navigation, branding text
- **Footer**: Background, text, company highlight
- **Document Manager**: Status badges (Active/Archived)
- **Dashboard**: Coming soon sections
- **Reports**: Coming soon sections  
- **Compliance Checker**: Error messages

### Deployment After Color Changes
Since colors are frontend-only changes:
```bash
# Navigate to project directory
cd ~/codealign/

# Rebuild frontend (fast deployment)
npm run build

# Changes are immediately live - no server restart needed
```

### **Gradient System Architecture** 🎨

**CRITICAL DISCOVERY**: The system uses **CSS gradient variables** for beautiful button gradations:

#### **How Gradients Work:**
```css
/* Gradient definitions in /src/index.css */
--gradient-primary: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)));
--gradient-accent: linear-gradient(135deg, hsl(var(--accent)), hsl(var(--accent-glow)));

/* These create the beautiful gradations you see on buttons and UI elements */
```

#### **Key Gradient Rules:**
1. **Primary buttons** automatically use `--gradient-primary` 
2. **Logo gradients** are defined separately in `/src/config/colors.ts`
3. **Both systems must match** for logo and buttons to look coordinated
4. **Gradient contrast**: `-glow` should be 10-15% lighter than base color

#### **When Gradients Break:**
- ❌ **Buttons show flat color**: CSS variables don't match component colors
- ❌ **No visible gradient**: `-glow` value too close to base color  
- ❌ **Colors don't match**: Only updated one system, not both

#### **Perfect Gradient Setup:**
- ✅ **Component colors** (logo): `primary: "rgb(153, 27, 27)"`
- ✅ **CSS variables**: `--primary: 0 70% 35%; --primary-glow: 0 70% 50%;`
- ✅ **Result**: Logo and buttons match with beautiful gradations

### **Design System Maintenance Rules** 📐

**CRITICAL**: All future color modifications MUST follow these principles:

#### **Never Do:**
- ❌ Add 6th or 7th core color without strong justification
- ❌ Use different colors for same functional elements
- ❌ Create one-off colors for specific features
- ❌ Break the established element-to-color mappings

#### **Always Do:**
- ✅ Map new UI elements to existing 5-color system
- ✅ Use color variations (opacity, tints, shades) before adding new colors
- ✅ Maintain element-color consistency across all themes
- ✅ Test color combinations for accessibility compliance
- ✅ Present multiple professional options before implementing

#### **When to Consider 6th Color:**
Only if you can clearly justify:
1. **Distinct functional purpose** not covered by existing 5 colors
2. **Critical user experience need** for differentiation
3. **Industry standard requirement** (e.g., medical emergency red)
4. **Accessibility compliance** necessity

#### **Color Hierarchy Testing:**
Before finalizing any theme:
1. **Visual scan test**: Can user immediately identify most important elements?
2. **Functional clarity**: Are different button types clearly distinguishable?
3. **Brand consistency**: Does primary color dominate appropriately?
4. **Professional assessment**: Does it look authoritative and trustworthy?

### Future Enhancement Ideas
- **Theme persistence**: Save user's preferred theme in localStorage
- **Dynamic theme switching**: Add theme selector in UI
- **Dark mode support**: Add dark theme variations (following same 5-color structure)
- **Brand customization API**: Allow theme changes via admin panel
- **CSS custom properties**: Generate CSS variables automatically
- **Industry theme library**: Expand themes for healthcare, corporate, government sectors

## Important Notes
1. **Frontend changes**: Just `npm run build` - much faster
2. **Backend changes**: Require full deploy + restart
3. **Don't kill active shell**: Avoid `kill -9` on current process
4. **Source vs Production**: Always edit in `~/codealign/`, not `/opt/`
5. **Archive workflow**: Smart filename management for version control
6. **Color changes**: Frontend only - no server restart required

