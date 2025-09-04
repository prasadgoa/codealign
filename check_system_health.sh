#!/bin/bash

# RAG System Health Check Script
# Checks all components of the RAG compliance system

echo "=========================================="
echo "RAG SYSTEM HEALTH CHECK"
echo "$(date)"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check service status
check_service() {
    local service_name=$1
    local url=$2
    local description=$3
    
    echo -n "[$description] "
    
    if curl -s -f -o /dev/null -w '' --max-time 5 "$url" 2>/dev/null; then
        echo -e "${GREEN}✓ HEALTHY${NC}"
        return 0
    else
        echo -e "${RED}✗ UNHEALTHY${NC}"
        return 1
    fi
}

# Function to check systemd service
check_systemd() {
    local service=$1
    local description=$2
    
    echo -n "[$description] "
    
    if systemctl is-active --quiet "$service"; then
        echo -e "${GREEN}✓ RUNNING${NC}"
        return 0
    else
        echo -e "${RED}✗ NOT RUNNING${NC}"
        return 1
    fi
}

# Function to check Docker container
check_container() {
    local container=$1
    local description=$2
    
    echo -n "[$description] "
    
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo -e "${GREEN}✓ RUNNING${NC}"
        return 0
    else
        echo -e "${RED}✗ NOT RUNNING${NC}"
        return 1
    fi
}

echo "1. CORE SERVICES"
echo "-----------------"
check_systemd "rag-api" "RAG API Server"
check_service "http://localhost:3001/api/health" "http://localhost:3001" "RAG API Health Endpoint"
echo ""

echo "2. DOCKER CONTAINERS"
echo "--------------------"
check_container "postgres-rag" "PostgreSQL Database"
check_container "qdrant" "Qdrant Vector DB"
check_container "tika" "Apache Tika"
check_container "tei" "Text Embeddings (TEI)"
check_container "n8n" "n8n Workflow Engine"
echo ""

echo "3. SERVICE ENDPOINTS"
echo "--------------------"
check_service "http://172.17.0.1:6333/collections/compliance_docs" "http://172.17.0.1:6333" "Qdrant Vector DB"
check_service "http://35.209.113.236:9998/tika" "http://35.209.113.236:9998" "Apache Tika"
check_service "http://172.17.0.1:8081/health" "http://172.17.0.1:8081" "TEI Embeddings"
check_service "http://35.209.113.236:5678" "http://35.209.113.236:5678" "n8n Workflow"
check_service "http://35.209.219.117:8000/v1/models" "http://35.209.219.117:8000" "LLM Service (vLLM)"
check_service "http://35.209.219.117:8082/health" "http://35.209.219.117:8082" "Reranker Service"
echo ""

echo "4. DATABASE STATUS"
echo "------------------"
echo -n "[PostgreSQL Connection] "
if docker exec postgres-rag psql -U rag_user -d rag_system -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ CONNECTED${NC}"
    
    # Get document stats
    DOC_COUNT=$(docker exec postgres-rag psql -U rag_user -d rag_system -t -c "SELECT COUNT(*) FROM documents;" 2>/dev/null | xargs)
    CHUNK_COUNT=$(docker exec postgres-rag psql -U rag_user -d rag_system -t -c "SELECT COUNT(*) FROM document_chunks;" 2>/dev/null | xargs)
    PROCESSING=$(docker exec postgres-rag psql -U rag_user -d rag_system -t -c "SELECT COUNT(*) FROM documents WHERE processing_status = 'processing';" 2>/dev/null | xargs)
    
    echo "  Documents: $DOC_COUNT"
    echo "  Chunks: $CHUNK_COUNT"
    if [ "$PROCESSING" -gt 0 ]; then
        echo -e "  Processing: ${YELLOW}$PROCESSING document(s) in progress${NC}"
    else
        echo "  Processing: None in progress"
    fi
else
    echo -e "${RED}✗ CONNECTION FAILED${NC}"
fi
echo ""

echo "5. VECTOR DATABASE"
echo "------------------"
echo -n "[Qdrant Collection] "
QDRANT_RESPONSE=$(curl -s "http://172.17.0.1:6333/collections/compliance_docs" 2>/dev/null)
if echo "$QDRANT_RESPONSE" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}✓ AVAILABLE${NC}"
    
    # Extract vector count using grep and sed
    VECTOR_COUNT=$(echo "$QDRANT_RESPONSE" | grep -o '"vectors_count":[0-9]*' | grep -o '[0-9]*')
    echo "  Vectors: ${VECTOR_COUNT:-0}"
else
    echo -e "${RED}✗ NOT AVAILABLE${NC}"
fi
echo ""

echo "6. FRONTEND"
echo "-----------"
check_service "http://35.209.113.236:3000" "http://35.209.113.236:3000" "React Frontend"
echo ""

echo "7. SYSTEM RESOURCES"
echo "-------------------"
echo "Memory Usage:"
free -h | grep "^Mem:" | awk '{print "  Total: " $2 ", Used: " $3 ", Free: " $4 ", Usage: " int($3/$2*100) "%"}'

echo ""
echo "Disk Usage:"
df -h / | tail -1 | awk '{print "  Total: " $2 ", Used: " $3 ", Free: " $4 ", Usage: " $5}'

echo ""
echo "Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.State}}" | head -10

echo ""
echo "=========================================="
echo "QUICK COMMANDS:"
echo "=========================================="
echo "View API logs:        sudo journalctl -u rag-api -f"
echo "Restart API:          sudo systemctl restart rag-api"
echo "Check processing:     docker exec postgres-rag psql -U rag_user -d rag_system -c \"SELECT * FROM documents WHERE processing_status = 'processing';\""
echo "View embeddings log:  sudo journalctl -u rag-api | grep 'batch.*261' | tail -5"
echo "Clear all docs:       curl -X DELETE http://localhost:3001/api/documents"
echo ""

# Exit with error if any service is unhealthy
if [ $? -ne 0 ]; then
    exit 1
fi