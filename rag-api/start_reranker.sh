#!/bin/bash

# Script to start the reranker service

echo "Starting Reranker Service..."

# Check if virtual environment exists
if [ ! -d "reranker_venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv reranker_venv
fi

# Activate virtual environment
source reranker_venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q -r reranker_requirements.txt

# Start the service
echo "Starting reranker on port 8082..."
export RERANKER_PORT=8082
export RERANKER_MODEL="cross-encoder/ms-marco-MiniLM-L-6-v2"
python reranker_service.py