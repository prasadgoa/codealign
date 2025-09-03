#!/usr/bin/env python3
"""
Cross-encoder reranking service using ms-marco-MiniLM-L-6-v2
Provides HTTP API for reranking document chunks based on query relevance
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import CrossEncoder
import numpy as np
import time
import logging
import os

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Initialize the model globally (loaded once at startup)
MODEL_NAME = os.environ.get('RERANKER_MODEL', 'cross-encoder/ms-marco-MiniLM-L-6-v2')
logger.info(f"Loading reranking model: {MODEL_NAME}")
model = CrossEncoder(MODEL_NAME, max_length=512)
logger.info(f"Model loaded successfully")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model': MODEL_NAME,
        'service': 'reranker'
    })

@app.route('/rerank', methods=['POST'])
def rerank():
    """
    Rerank documents based on query relevance
    
    Expected JSON payload:
    {
        "query": "search query",
        "documents": ["doc1 text", "doc2 text", ...],
        "top_k": 5 (optional, default: all documents)
    }
    
    Returns:
    {
        "scores": [0.95, 0.82, ...],
        "rankings": [{"index": 0, "score": 0.95}, ...],
        "processing_time": 0.234
    }
    """
    try:
        start_time = time.time()
        
        # Parse request
        data = request.json
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        query = data.get('query')
        documents = data.get('documents', [])
        top_k = data.get('top_k', len(documents))
        
        # Validate inputs
        if not query:
            return jsonify({'error': 'Query is required'}), 400
        if not documents:
            return jsonify({'error': 'Documents list is required'}), 400
        if not isinstance(documents, list):
            return jsonify({'error': 'Documents must be a list'}), 400
        
        logger.info(f"Reranking {len(documents)} documents for query: {query[:100]}...")
        
        # Create query-document pairs
        pairs = [[query, doc] for doc in documents]
        
        # Get scores from the model
        scores = model.predict(pairs)
        
        # Convert to Python float type (from numpy)
        scores = [float(score) for score in scores]
        
        # Create rankings (sorted by score descending)
        rankings = [
            {'index': idx, 'score': score} 
            for idx, score in enumerate(scores)
        ]
        rankings.sort(key=lambda x: x['score'], reverse=True)
        
        # Limit to top_k if specified
        rankings = rankings[:top_k]
        
        processing_time = time.time() - start_time
        logger.info(f"Reranking completed in {processing_time:.3f} seconds")
        
        return jsonify({
            'scores': scores,
            'rankings': rankings,
            'processing_time': processing_time,
            'model': MODEL_NAME
        })
        
    except Exception as e:
        logger.error(f"Error during reranking: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/rerank_with_metadata', methods=['POST'])
def rerank_with_metadata():
    """
    Rerank documents with metadata preservation
    
    Expected JSON payload:
    {
        "query": "search query",
        "chunks": [
            {"text": "doc1 text", "metadata": {...}, "score": 0.8},
            {"text": "doc2 text", "metadata": {...}, "score": 0.7}
        ],
        "top_k": 5 (optional)
    }
    
    Returns original chunks with added rerank_score
    """
    try:
        start_time = time.time()
        
        data = request.json
        query = data.get('query')
        chunks = data.get('chunks', [])
        top_k = data.get('top_k', len(chunks))
        
        if not query or not chunks:
            return jsonify({'error': 'Query and chunks are required'}), 400
        
        # Extract texts for reranking
        texts = [chunk.get('text', '') for chunk in chunks]
        
        # Create pairs and get scores
        pairs = [[query, text] for text in texts]
        scores = model.predict(pairs)
        
        # Add rerank scores to chunks
        reranked_chunks = []
        for idx, (chunk, score) in enumerate(zip(chunks, scores)):
            reranked_chunk = chunk.copy()
            reranked_chunk['rerank_score'] = float(score)
            reranked_chunk['rerank_position'] = idx
            reranked_chunks.append(reranked_chunk)
        
        # Sort by rerank score
        reranked_chunks.sort(key=lambda x: x['rerank_score'], reverse=True)
        
        # Limit to top_k
        reranked_chunks = reranked_chunks[:top_k]
        
        processing_time = time.time() - start_time
        
        return jsonify({
            'chunks': reranked_chunks,
            'processing_time': processing_time,
            'model': MODEL_NAME
        })
        
    except Exception as e:
        logger.error(f"Error during reranking with metadata: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('RERANKER_PORT', 8082))
    logger.info(f"Starting reranker service on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)