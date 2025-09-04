const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');

class EnhancedChunker {
    constructor() {
        this.splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1500,
            chunkOverlap: 200,
            separators: [
                "\n## ",     // Section headers
                "\n### ",    // Subsections  
                "\n\n",      // Paragraphs
                "\n",        // Lines
                ". ",        // Sentences
                " "          // Words
            ],
            keepSeparator: true,
            lengthFunction: (text) => text.length,
        });
    }

    async chunkDocument(text, filename) {
        try {
            const chunks = await this.splitter.splitText(text);
            
            return chunks.map((chunk, index) => ({
                text: chunk.trim(),
                metadata: {
                    section: this.extractSection(chunk),
                    doc_type: this.inferDocType(filename),
                    has_requirements: this.hasRequirements(chunk),
                    chunk_index: index,
                    document: filename
                }
            }));
        } catch (error) {
            console.error('Error chunking document:', error);
            throw error;
        }
    }

    extractSection(chunk) {
        // Look for section patterns like "Section Q104.1", "Appendix A", etc.
        const sectionMatch = chunk.match(/(?:Section|Appendix|Chapter)\s+([A-Z0-9]+(?:\.[0-9]+)*)/i);
        if (sectionMatch) {
            return sectionMatch[1];
        }
        
        // Look for numbered sections like "1.2.3"
        const numberedMatch = chunk.match(/^(\d+(?:\.\d+)*)/m);
        if (numberedMatch) {
            return numberedMatch[1];
        }
        
        return null;
    }

    inferDocType(filename) {
        const lower = filename.toLowerCase();
        if (lower.includes('fire')) return 'fire_code';
        if (lower.includes('building')) return 'building_code';
        if (lower.includes('safety')) return 'safety';
        if (lower.includes('compliance')) return 'compliance';
        return 'general';
    }

    hasRequirements(chunk) {
        return /\b(shall|must|required|mandatory|prohibited)\b/i.test(chunk);
    }
}

class QueryClassifier {
    constructor() {
        // Enable detailed chunk selection profiling (set to false for production)
        this.ENABLE_SELECTION_PROFILING = true; // Temporarily always enabled for testing
    }

    classifyQuery(query) {
        const lower = query.toLowerCase();
        
        // Definition queries
        if (/^(what is|define|definition of)/i.test(query)) {
            return 'definition';
        }
        
        // Specific section reference
        if (/^(section|appendix|chapter)\s+[A-Z0-9]/i.test(query)) {
            return 'specific_section';
        }
        
        // List queries
        if (/\b(list|all|enumerate|requirements for)\b/i.test(query)) {
            return 'list';
        }
        
        // Yes/no questions
        if (/^(is|are|does|must|can|should|do I need)\b/i.test(query)) {
            return 'yes_no';
        }
        
        // Procedure/how-to queries
        if (/^(how to|how do|procedure|steps)/i.test(query)) {
            return 'procedure';
        }
        
        return 'general';
    }

    selectOptimalChunkCount(query, rerankedChunks) {
        const queryType = this.classifyQuery(query);
        
        // Use new token-based adaptive selection
        const result = this.selectChunksWithTokenBudget(query, rerankedChunks, queryType);
        
        // Log basic metrics for performance tuning
        console.log('QUERY_METRICS:', JSON.stringify({
            query_type: queryType,
            token_budget: result.tokenBudget,
            tokens_used: result.tokensUsed,
            token_utilization: (result.tokensUsed / result.tokenBudget).toFixed(2),
            chunks_selected: result.selectedCount,
            avg_rerank_score: result.avgRerankScore?.toFixed(2),
            stop_reason: result.stopReason,
            chunks_considered: result.chunksConsidered,
            chunks_skipped: result.chunksSkipped,
            requery_performed: false
        }));

        // Log detailed chunk selection profiling if enabled
        if (this.ENABLE_SELECTION_PROFILING && result.selectionProfile) {
            console.log('CHUNK_SELECTION_PROFILE:', JSON.stringify({
                query_type: queryType,
                stop_reason: result.stopReason,
                chunks_considered: result.chunksConsidered,
                chunks_selected: result.selectedCount,
                chunks_skipped: result.chunksSkipped,
                selection_profile: result.selectionProfile
            }));
        }
        
        return result.selectedCount;
    }

    selectChunksWithTokenBudget(query, rerankedChunks, queryType) {
        // Token budgets and thresholds by query type
        const typeConfig = {
            'definition': { maxTokens: 500, minTokens: 150, retrieveLimit: 25 },
            'specific_section': { maxTokens: 800, minTokens: 200, retrieveLimit: 30 },
            'yes_no': { maxTokens: 700, minTokens: 200, retrieveLimit: 30 },
            'list': { maxTokens: 2000, minTokens: 500, retrieveLimit: 50 },
            'procedure': { maxTokens: 1500, minTokens: 400, retrieveLimit: 40 },
            'analysis': { maxTokens: 3000, minTokens: 600, retrieveLimit: 60 },
            'general': { maxTokens: 1200, minTokens: 300, retrieveLimit: 40 }
        };

        const config = typeConfig[queryType] || typeConfig.general;
        
        // Quality thresholds
        const RERANK_THRESHOLD = -2.0;
        const VECTOR_THRESHOLD = 0.5;
        
        let selectedChunks = [];
        let tokensUsed = 0;
        let rerankScoreSum = 0;
        let stopReason = 'completed_all_chunks';
        let selectionProfile = [];
        let chunksConsidered = 0;
        let chunksSkipped = 0;

        // Process chunks in rerank score order (highest relevance first)
        for (let i = 0; i < rerankedChunks.length; i++) {
            const chunk = rerankedChunks[i];
            chunksConsidered++;
            const chunkTokens = this.estimateTokenCount(chunk.text);
            
            let chunkProfile = {
                index: i,
                rerank_score: parseFloat(chunk.rerank_score.toFixed(2)),
                vector_score: parseFloat((chunk.metadata?.vector_score || 0).toFixed(2)),
                chunk_tokens: chunkTokens,
                selected: false,
                reason: null
            };
            
            // Apply quality gates
            if (chunk.rerank_score < RERANK_THRESHOLD) {
                chunkProfile.reason = `rerank_below_${RERANK_THRESHOLD}`;
                stopReason = `rerank_threshold_${chunk.rerank_score.toFixed(2)}`;
                if (this.ENABLE_SELECTION_PROFILING) selectionProfile.push(chunkProfile);
                break;
            }
            
            if ((chunk.metadata?.vector_score || 0) < VECTOR_THRESHOLD) {
                chunkProfile.reason = `vector_below_${VECTOR_THRESHOLD}`;
                chunksSkipped++;
                if (this.ENABLE_SELECTION_PROFILING) selectionProfile.push(chunkProfile);
                continue;
            }
            
            // Check if adding this chunk would exceed budget
            if (tokensUsed + chunkTokens > config.maxTokens) {
                // Only stop if we've met minimum token requirements
                if (tokensUsed >= config.minTokens) {
                    chunkProfile.reason = 'token_budget_exceeded';
                    chunkProfile.would_total = tokensUsed + chunkTokens;
                    stopReason = `token_budget_${tokensUsed + chunkTokens}_exceeds_${config.maxTokens}`;
                    if (this.ENABLE_SELECTION_PROFILING) selectionProfile.push(chunkProfile);
                    break;
                }
                
                // If we haven't met minimum, skip this chunk and continue
                chunkProfile.reason = 'token_budget_skip_under_minimum';
                chunksSkipped++;
                if (this.ENABLE_SELECTION_PROFILING) selectionProfile.push(chunkProfile);
                continue;
            }
            
            // Chunk passed all gates - select it
            selectedChunks.push(chunk);
            tokensUsed += chunkTokens;
            rerankScoreSum += chunk.rerank_score;
            
            chunkProfile.selected = true;
            chunkProfile.cumulative_tokens = tokensUsed;
            if (this.ENABLE_SELECTION_PROFILING) selectionProfile.push(chunkProfile);
        }

        // Ensure we have at least one chunk if available
        if (selectedChunks.length === 0 && rerankedChunks.length > 0) {
            const bestChunk = rerankedChunks[0];
            selectedChunks.push(bestChunk);
            tokensUsed = this.estimateTokenCount(bestChunk.text);
            rerankScoreSum = bestChunk.rerank_score;
        }

        const result = {
            selectedCount: selectedChunks.length,
            tokenBudget: config.maxTokens,
            tokensUsed,
            avgRerankScore: selectedChunks.length > 0 ? rerankScoreSum / selectedChunks.length : 0,
            meetsMinimum: tokensUsed >= config.minTokens,
            stopReason,
            chunksConsidered,
            chunksSkipped
        };

        // Add detailed profiling data if enabled
        if (this.ENABLE_SELECTION_PROFILING && selectionProfile.length > 0) {
            result.selectionProfile = selectionProfile;
        }

        return result;
    }

    estimateTokenCount(text) {
        return Math.ceil(text.length * 0.25); // 1 token ≈ 4 chars
    }
}

class PromptEnhancer {
    buildEnhancedPrompt(query, chunks, queryType) {
        // Since vLLM now has persistent system prompt, we only need context and query
        const contextSection = `CONTEXT FROM COMPLIANCE DOCUMENTS:\n${
            chunks.map((c, i) => 
                `[Source ${i+1}: ${c.metadata.document}${c.metadata.section ? `, Section ${c.metadata.section}` : ''}]\n${c.text}\n`
            ).join('\n')
        }`;

        const querySection = `\nQUESTION: ${query}`;

        // Optional query-specific hints (much shorter now)
        const queryHints = {
            'definition': '\n(Provide definition with section reference)',
            'yes_no': '\n(Start with Yes/No)',
            'list': '\n(Provide numbered list)',
            'specific_section': '\n(Quote exact text)',
            'procedure': '\n(Step-by-step instructions)'
        };

        const hint = queryHints[queryType] || '';
        
        return contextSection + querySection + hint;
    }
}

module.exports = {
    EnhancedChunker,
    QueryClassifier,
    PromptEnhancer
};