#!/bin/bash

# Quick script to check document processing status

echo "=========================================="
echo "DOCUMENT PROCESSING STATUS"
echo "$(date)"
echo "=========================================="
echo ""

# Check documents being processed
echo "Documents in processing:"
docker exec postgres-rag psql -U rag_user -d rag_system -t -c "
SELECT 
    id,
    filename,
    total_chunks,
    processing_status,
    EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_processing
FROM documents 
WHERE processing_status = 'processing';" 2>/dev/null

# Check latest batch progress
echo ""
echo "Latest embedding batch progress:"
sudo journalctl -u rag-api | grep "batch.*" | tail -5

# Check TEI service health
echo ""
echo "TEI Embedding Service Status:"
curl -s http://172.17.0.1:8081/health 2>/dev/null || echo "TEI service not responding"

echo ""
echo "=========================================="