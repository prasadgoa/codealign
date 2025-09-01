# RAG Compliance System - Complete Project Documentation

## Project Overview
A Retrieval-Augmented Generation (RAG) system for compliance document processing and querying. Users upload compliance documents (PDF, DOCX, TXT) which are processed, chunked, embedded, and stored for semantic search-based question answering.

## System Architecture

### Document Processing Pipeline
**Method 1: n8n Workflow (Currently has format issues)**
n8n → File upload webhook → Apache Tika (text extraction) → Text chunking → Hugging Face TEI (embeddings) → Qdrant (vector storage) → PostgreSQL (metadata)

**Method 2: Direct API Upload (Recommended - Working)**
Express.js endpoint → Tika → Chunking → TEI → Qdrant → PostgreSQL (all in one API call)

### Query Pipeline
n8n → Query webhook → TEI (question embedding) → Qdrant search → Llama 3.1-8B (answer generation) → Response with source attribution

## Infrastructure Setup

### Virtual Machines
1. **rag-vm** (35.209.113.236) - Main processing server
2. **gpt20b** (35.209.219.117) - LLM inference server

### rag-vm Services (35.209.113.236)
- **n8n Workflow Engine**: Port 5678 (`http://35.209.113.236:5678`)
- **Express API Server**: Port 3001 (`http://35.209.113.236:3001`)
- **React Frontend**: Port 3000 (`http://35.209.113.236:3000`)
- **Apache Tika**: Port 9998 (`http://35.209.113.236:9998`)
- **TEI Embedding Service**: Port 8081 (internal Docker: `http://172.17.0.1:8081`)
- **Qdrant Vector DB**: Port 6333 (internal Docker: `http://172.17.0.1:6333`)
- **PostgreSQL**: Port 5433 (Docker container: `postgres-rag`)

### gpt20b Services (35.209.219.117)
- **vLLM + Llama 3.1-8B**: Port 8000 (`http://35.209.219.117:8000`)

### Networking
- **Docker bridge**: 172.17.0.1 for internal service communication
- **Firewall ports**: 9998, 8081, 8000, 6333, 3000, 5678, 3001, 5433

## Database Configuration

### PostgreSQL (Container: postgres-rag)
```bash
Host: localhost (35.209.113.236)
Port: 5433
Database: rag_system
User: rag_user
Password: rag_secure_2025
Container: postgres-rag

# Connection test:
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "\dt"
```

### Database Schema
- **documents**: Document metadata (id, filename, file_size, processing_status, etc.)
- **document_chunks**: Chunk metadata (document_id, vector_id, text, chunk_index, etc.)
- **processing_logs**: Processing step logs (document_id, step, status, message, timing)

### Qdrant Vector Database
```bash
Collection: compliance_docs
Dimensions: 384 (e5-small-v2 model)
Distance: Cosine
Internal URL: http://172.17.0.1:6333

# Status check:
curl -X GET "http://172.17.0.1:6333/collections/compliance_docs"
```

## Tech Stack

### Backend Services
- **Express.js** - API server with document management
- **PostgreSQL 15** - Document and chunk metadata storage
- **Qdrant** - Vector database for semantic search
- **Apache Tika** - Document text extraction
- **TEI (e5-small-v2)** - Text embedding generation
- **vLLM + Llama 3.1-8B-Instruct** - LLM for answer generation

### Frontend
- **React** - User interface
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **TypeScript** - Type safety

### Orchestration
- **n8n** - Workflow automation (currently with issues)
- **Docker** - Service containerization
- **systemctl** - Service management

## File Structure

### Backend (`/opt/rag-api/`)
```
/opt/rag-api/
├── server.js          # Express API server with all endpoints
├── database.js        # DocumentDatabase class for PostgreSQL operations
├── package.json       # Node.js dependencies
└── node_modules/      # Dependencies
```

### Frontend (`/home/prasadk/codealign/`)
```
/home/prasadk/codealign/
├── src/
│   ├── components/
│   │   ├── document-manager.tsx     # Document CRUD UI
│   │   └── compliance-checker.tsx   # Query interface
│   └── pages/Index.tsx
├── workflows/                       # n8n workflow definitions
│   ├── upload-document-workflow.json
│   └── query-compliance-workflow.json
├── database/migrations/schema.sql   # Database schema
└── dist/                           # Built React app (served on port 3000)
```

## Current Implementation Status

### Step 1: Database Integration - COMPLETE ✅
- PostgreSQL container running with correct schema
- Express API server with database integration
- All CRUD endpoints functional
- Document duplicate detection working

### Step 2: Enhanced Upload Processing - COMPLETE
**Working Components:**
- File upload and duplicate detection ✅
- Text extraction via Tika ✅
- Text chunking ✅
- TEI embedding generation ✅

### Step 3: Source Attribution - PENDING ⏳
- Query workflow needs enhancement for source attribution
- UI needs update to display source information

## API Endpoints

### Working Endpoints
```bash
# Health check
GET http://35.209.113.236:3001/api/health

# Document management
GET http://35.209.113.236:3001/api/documents
GET http://35.209.113.236:3001/api/documents/:id
DELETE http://35.209.113.236:3001/api/documents/:id
DELETE http://35.209.113.236:3001/api/documents

# Query (uses n8n)
POST http://35.209.113.236:3001/api/query
Body: {"query": "your question"}

# Direct upload (bypasses n8n)
POST http://35.209.113.236:3001/api/upload-document-direct
Form data: file=@/path/to/document.pdf
```

### n8n Webhooks
```bash
# Upload workflow (has issues)
POST http://35.209.113.236:5678/webhook-test/upload-document

# Query workflow (working)
POST http://35.209.113.236:5678/webhook/d9ece4d6-a9da-494b-bb03-caba40eae672
Body: {"query": "your question"}
```

## Service Management Commands

### Database Operations
```bash
# PostgreSQL connection
docker exec -it postgres-rag psql -U rag_user -d rag_system

# Check documents
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "SELECT id, filename, processing_status, total_chunks FROM documents;"

# Clear all data
docker exec -it postgres-rag psql -U rag_user -d rag_system -c "DELETE FROM processing_logs; DELETE FROM document_chunks; DELETE FROM documents;"
```

### Vector Database Operations
```bash
# Qdrant status
curl -X GET "http://172.17.0.1:6333/collections/compliance_docs"

# Clear vectors
curl -X DELETE "http://172.17.0.1:6333/collections/compliance_docs"
curl -X PUT "http://172.17.0.1:6333/collections/compliance_docs" -H "Content-Type: application/json" -d '{"vectors": {"size": 384, "distance": "Cosine"}}'

# Manual vector test
curl -X PUT "http://172.17.0.1:6333/collections/compliance_docs/points" -H "Content-Type: application/json" -d '{"points": [{"id": "test", "vector": [0.1, 0.2, 0.3], "payload": {"test": "data"}}]}'
```

### Service Management
```bash
# API server
sudo systemctl restart rag-api
sudo systemctl status rag-api
sudo journalctl -u rag-api -f

# Container status
docker ps
docker logs postgres-rag
```



### Key Test Commands
```bash
# Full pipeline test
curl -X POST -F "file=@/tmp/test-new.txt" http://localhost:3001/api/upload-document-direct

# Service health checks
curl -X GET http://localhost:3001/api/health
curl -X GET http://localhost:3001/api/documents

# Individual service tests
curl -X POST -F "file=@/tmp/test.txt" http://35.209.113.236:9998/tika/form -H "Accept: text/plain"
curl -X POST "http://172.17.0.1:8081/embed" -H "Content-Type: application/json" -d '{"inputs": "test", "truncate": true}'
```

## Working Test Files
- `/tmp/hello.txt` - Already exists in system (duplicate detection working)
- `/tmp/test-new.txt` - Create new test content for upload testing
- `/tmp/ncfd.pdf` - Original PDF document for testing

## Special instructions
1.
~codealign/rag-api is the directory for source file for the services.
Do sudo cp -r ~/codealign/rag-api/* /opt/rag-api/
and deploy by sudo systemctl restart rag-api

2. Don't attempt to kill the shell that you are running in. That will kill you, lose context, and create work for me. 

## When you are bug fixing - calude-code shell is being killed by claude code like below - Please don't do it!! This happened twice.
> Again failed upload

● Let me check what's happening with the upload. First, let me look at the service logs to see the error:

● Bash(sudo journalctl -u rag-api -f --lines=20)
  ⎿  Running in the background (down arrow to manage)

● BashOutput(Reading shell output)
  ⎿  Sep 01 05:14:03 rag-vm systemd[1]: rag-api.service: Deactivated successfully.
     Sep 01 05:14:03 rag-vm systemd[1]: Stopped RAG API Server.
     Sep 01 05:14:03 rag-vm systemd[1]: Started RAG API Server.
     … +21 lines (ctrl+r to expand)

● I can see the issue! The error shows that /home/prasadk directory doesn't exist on the server. The service is
  running on the rag-vm server, but I was assuming the same directory structure. Let me check what directories
  exist and fix this:

● Kill Bash(Kill shell: bash_1)
  ⎿  Shell bash_1 killed

✻ Shenaniganing… (esc to interrupt)
  ⎿  Tip: Start with small features or bug fixes, tell Claude to propose a plan, and verify its suggested edits

╭──────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ >                                                                                                                │
╰──────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
  ? for shortcuts
374 | `+await Z.crypto.sha256DigestHex(F),q=await Bu5(Z.crypto,Z.securityCredentials.secretAccessKey,J,Z.region,Y),N=await RY0(Z.crypto,q,D),E=`${fRG} Credential=${Z.securityCredentials.accessKeyId}/${w}, SignedHeaders=${I}, Signature=${kRG.fromArrayBufferToHex(N)}`;return{amzDate:Q.date?void 0:B,authorizationHeader:E,canonicalQuerystring:Z.canonicalQuerystring}}});var uRG=C((Un)=>{var dM=Un&&Un.__classPrivateFieldGet||function(Z,G,W,Y){if(W==="a"&&!Y)throw new TypeError("Private accessor was defined without a getter");if(typeof G==="function"?Z!==G||!Y:!G.has(Z))throw new TypeError("Cannot read private member from an object whose class did not declare it");return W==="m"?Y:W==="a"?Y.call(Z):Y?Y.value:G.get(Z)},bU,j41,bRG,hRG,eN0,v41;Object.defineProperty(Un,"__esModule",{value:!0});Un.DefaultAwsSecurityCredentialsSupplier=void 0;class gRG{constructor(Z){bU.add(this),this.regionUrl=Z.regionUrl,this.securityCredentialsUrl=Z.securityCredentialsUrl,this.imdsV2SessionTokenUrl=Z.imdsV2SessionTokenUrl,this.additionalGaxi | ... truncated 
375 | To learn more about authentication and Google APIs, visit:
376 | https://cloud.google.com/docs/authentication/getting-started`,NO_CREDENTIALS_FOUND:`Unable to find credentials in current environment.
377 | To learn more about authentication and Google APIs, visit:
378 | https://cloud.google.com/docs/authentication/getting-started`,NO_ADC_FOUND:"Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.",NO_UNIVERSE_DOMAIN_FOUND:`Unable to detect a Universe Domain in the current environment.
379 | https://cloud.google.com/compute/docs/metadata/predefined-metadata-keys`};class e41{get isGCE(){return this.checkIsGCE}constructor(Z={}){if(Qy.add(this),this.checkIsGCE=void 0,this.jsonContent=null,this.cachedCredential=null,Ln.set(this,null),this.clientOptions={},this._cachedProjectId=Z.projectId||null,this.cachedCredential=Z.authClient||null,this.keyFilename=Z.keyFilename||Z.keyFile,this.scopes=Z.scopes,this.clientOptions=Z.clientOptions||{},this.jsonContent=Z.credentials||null,this.apiKey=Z.apiKey||this.clientOptions.apiKey||null,this.apiKey&&(this.jsonContent||this.clientOptions.credentials))throw new RangeError(Q7.GoogleAuthExceptionMessages.API_KEY_WITH_CREDENTIALS);if(Z.universeDomain)this.clientOptions.universeDomain=Z.universeDomain}setGapicJWTValues(Z){Z.defaultServicePath=this.defaultServicePath,Z.useJWTAccessWithScope=this.useJWTAccessWithScope,Z.defaultScopes=this.defaultScopes}getProjectId(Z){if(Z)this.getProjectIdAsync().then((G)=>Z(null,G),Z);else return this.getProjectIdAsync()}async getProje | ... truncated 

SystemError: kill() failed: EPERM: Operation not permitted
 syscall: "kill",
   errno: 1,
    code: "EPERM"

      at QPG (/$bunfs/root/claude:379:19786)
      at <anonymous> (/$bunfs/root/claude:379:19658)
      at forEach (1:11)
      at <anonymous> (/$bunfs/root/claude:379:19633)
      at forEach (1:11)
      at BPG (/$bunfs/root/claude:379:19605)
      at <anonymous> (/$bunfs/root/claude:379:19532)
      at Q (/$bunfs/root/claude:379:20015)
      at emit (node:events:98:22)

Bun v1.2.19 (Linux x64 baseline)
prasadk@rag-vm:~/codealign$ Read from remote host 35.209.113.236: Connection reset by peer
Connection to 35.209.113.236 closed.
client_loop: send disconnect: Broken pipe
# End of special instrction 2.

# Here is the shared TODO list of bug fixes and features. As we work and get these done, I will mark them done.

- UI enchancements for Document Manager panel
    1. Remove the refresh button above the remove all button, not sure what this is for (Done)
    2. The branding at the top is adhoc - improve it if you can. (Done)
- Document Search
    1. Reconsider if using n8n makes sense anymore (Done)
    2. If it doesn't implement n8n document upload workflow in node and use that instead (Done)
    3. Fix bug to make sure the search works realiably! (Done)
    4. Feature - Attribution. When answering a query, the system not only give answer, but also give attribution with document name and page number or section etc.,
