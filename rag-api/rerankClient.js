const axios = require('axios');

class RerankClient {
    constructor(rerankUrl = 'http://35.209.219.117:8082') {
        this.rerankUrl = rerankUrl;
        this.timeout = 10000; // 10 second timeout
    }

    async rerank(query, documents) {
        try {
            const response = await axios.post(`${this.rerankUrl}/rerank`, {
                query: query,
                documents: documents
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: this.timeout
            });

            return response.data.reranked_results;
        } catch (error) {
            console.error('Reranking failed:', error.message);
            // Fallback: return original documents with dummy scores
            return documents.map((doc, index) => ({
                text: doc.text,
                metadata: doc.metadata || {},
                rerank_score: -index // Simple fallback scoring
            }));
        }
    }

    async healthCheck() {
        try {
            const response = await axios.get(`${this.rerankUrl}/health`, {
                timeout: 5000
            });
            return response.data;
        } catch (error) {
            console.error('Reranker health check failed:', error.message);
            return { status: 'unhealthy', error: error.message };
        }
    }
}

module.exports = { RerankClient };