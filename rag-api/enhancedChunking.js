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

    selectOptimalChunks(query, vectorResults) {
        const queryType = this.classifyQuery(query);
        
        // Use new token-based adaptive selection with vector-first ordering
        const result = this.selectChunksWithTokenBudget(query, vectorResults, queryType);
        
        // Log basic metrics for performance tuning
        console.log('QUERY_METRICS:', JSON.stringify({
            query_type: queryType,
            token_budget: result.tokenBudget,
            tokens_used: result.tokensUsed,
            token_utilization: (result.tokensUsed / result.tokenBudget).toFixed(2),
            chunks_selected: result.selectedCount,
            chunks_reranked: result.chunksReranked,
            rerank_efficiency: `${result.chunksReranked}/${result.chunksConsidered}`,
            avg_rerank_score: result.avgRerankScore?.toFixed(2),
            stop_reason: result.stopReason,
            chunks_considered: result.chunksConsidered,
            chunks_skipped: result.chunksSkipped,
            ordering_strategy: 'vector_first_lazy_rerank',
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
        
        // Return both the selected chunks and metadata
        return {
            chunks: result.selectedChunks || [],
            count: result.selectedCount,
            metadata: result
        };
    }

    selectChunksWithTokenBudget(query, vectorResults, queryType) {
        // Updated token budgets - increased for better coverage
        const typeConfig = {
            'definition': { maxTokens: 800, minTokens: 200, retrieveLimit: 25 },
            'specific_section': { maxTokens: 1000, minTokens: 300, retrieveLimit: 30 },
            'yes_no': { maxTokens: 1000, minTokens: 300, retrieveLimit: 30 },
            'list': { maxTokens: 2800, minTokens: 700, retrieveLimit: 50 },
            'procedure': { maxTokens: 2000, minTokens: 500, retrieveLimit: 40 },
            'analysis': { maxTokens: 4000, minTokens: 800, retrieveLimit: 60 },
            'general': { maxTokens: 1800, minTokens: 400, retrieveLimit: 40 }
        };

        const config = typeConfig[queryType] || typeConfig.general;
        
        // Quality thresholds - vector first, rerank as quality gate only
        const RERANK_THRESHOLD = -3.0;  // More permissive
        const VECTOR_THRESHOLD = 0.5;
        
        // Step 1: Sort by vector score (highest first)
        const vectorSortedChunks = [...vectorResults].sort((a, b) => 
            (b.metadata?.vector_score || 0) - (a.metadata?.vector_score || 0)
        );
        
        let selectedChunks = [];
        let tokensUsed = 0;
        let rerankScoreSum = 0;
        let stopReason = 'completed_all_chunks';
        let selectionProfile = [];
        let chunksConsidered = 0;
        let chunksSkipped = 0;
        let chunksReranked = 0;

        // Step 2: Process chunks in vector score order with lazy reranking
        for (let i = 0; i < vectorSortedChunks.length; i++) {
            const chunk = vectorSortedChunks[i];
            chunksConsidered++;
            const chunkTokens = this.estimateTokenCount(chunk.text);
            
            let chunkProfile = {
                index: i,
                vector_score: parseFloat((chunk.metadata?.vector_score || 0).toFixed(2)),
                chunk_tokens: chunkTokens,
                selected: false,
                reason: null,
                rerank_score: null
            };
            
            // Apply vector quality gate first
            if ((chunk.metadata?.vector_score || 0) < VECTOR_THRESHOLD) {
                chunkProfile.reason = `vector_below_${VECTOR_THRESHOLD}`;
                chunksSkipped++;
                if (this.ENABLE_SELECTION_PROFILING) selectionProfile.push(chunkProfile);
                continue;
            }
            
            // Check token budget before expensive reranking
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
            
            // Step 3: Lazy reranking - only rerank when we're about to select
            let rerankScore;
            try {
                // This would be the reranking call - simulate for now
                chunksReranked++;
                // In real implementation: rerankScore = await rerankClient.rerankSingle(query, chunk);
                // For now, use existing rerank_score if available, otherwise simulate
                rerankScore = chunk.rerank_score || this.simulateRerankScore(query, chunk.text);
                chunkProfile.rerank_score = parseFloat(rerankScore.toFixed(2));
            } catch (error) {
                console.warn('Reranking failed, using vector score as fallback:', error);
                rerankScore = chunk.metadata?.vector_score || 0;
                chunkProfile.rerank_score = 'fallback';
            }
            
            // Apply rerank quality gate (more permissive)
            if (rerankScore < RERANK_THRESHOLD) {
                chunkProfile.reason = `rerank_below_${RERANK_THRESHOLD}`;
                chunksSkipped++;
                if (this.ENABLE_SELECTION_PROFILING) selectionProfile.push(chunkProfile);
                continue;
            }
            
            // Chunk passed all gates - select it
            chunk.rerank_score = rerankScore; // Update chunk with rerank score
            selectedChunks.push(chunk);
            tokensUsed += chunkTokens;
            rerankScoreSum += rerankScore;
            
            chunkProfile.selected = true;
            chunkProfile.cumulative_tokens = tokensUsed;
            if (this.ENABLE_SELECTION_PROFILING) selectionProfile.push(chunkProfile);
        }

        // Ensure we have at least one chunk if available
        if (selectedChunks.length === 0 && vectorSortedChunks.length > 0) {
            const bestChunk = vectorSortedChunks[0];
            bestChunk.rerank_score = bestChunk.rerank_score || this.simulateRerankScore(query, bestChunk.text);
            selectedChunks.push(bestChunk);
            tokensUsed = this.estimateTokenCount(bestChunk.text);
            rerankScoreSum = bestChunk.rerank_score;
            chunksReranked++;
        }

        const result = {
            selectedChunks,  // Include the actual selected chunks
            selectedCount: selectedChunks.length,
            tokenBudget: config.maxTokens,
            tokensUsed,
            avgRerankScore: selectedChunks.length > 0 ? rerankScoreSum / selectedChunks.length : 0,
            meetsMinimum: tokensUsed >= config.minTokens,
            stopReason,
            chunksConsidered,
            chunksSkipped,
            chunksReranked  // New metric for performance tracking
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

    simulateRerankScore(query, chunkText) {
        // Temporary simulation - in real implementation this would be a single rerank call
        // For now, return existing rerank score or estimate based on text similarity
        const queryLower = query.toLowerCase();
        const textLower = chunkText.toLowerCase();
        
        // Simple keyword overlap scoring as fallback
        const queryWords = queryLower.split(/\s+/);
        const textWords = new Set(textLower.split(/\s+/));
        
        let overlap = 0;
        queryWords.forEach(word => {
            if (textWords.has(word)) overlap++;
        });
        
        // Convert to rerank-like score (-10 to 10 range)
        const overlapRatio = overlap / queryWords.length;
        return (overlapRatio * 8) - 2; // Scale to reasonable rerank range
    }
}

class PromptEnhancer {
    buildEnhancedPrompt(query, chunks, queryType) {
        // Label chunks with letters A, B, C, etc. for easy reference
        const contextSection = `CONTEXT FROM COMPLIANCE DOCUMENTS:\n${
            chunks.map((c, i) => {
                const label = String.fromCharCode(65 + i); // A, B, C, etc.
                // Store label in metadata for later attribution mapping
                c.metadata.label = label;
                return `[${label}] ${c.metadata.document}, Page ${c.metadata.page_number || 'N/A'}${c.metadata.section ? `, Section: ${c.metadata.section}` : ''}:\n${c.text}\n`;
            }).join('\n')
        }`;

        const querySection = `\nUSER QUESTION: ${query}`;
        
        return contextSection + querySection;
    }
    
    // Extract inline citations from natural LLM response
    parseLLMResponse(llmResponse) {
        try {
            // Clean up the response (remove any ANSWER: prefix if present)
            const answer = llmResponse.replace(/^ANSWER:\s*/i, '').trim();
            
            // Extract all inline citation markers [A], [B], etc.
            const markerMatches = answer.match(/\[([A-Z])\]/g);
            const sourcesUsed = markerMatches 
                ? [...new Set(markerMatches.map(m => m.replace(/[\[\]]/g, '')))]  // Remove duplicates, get unique letters
                : [];
            
            return {
                answer,
                sourcesUsed,
                success: true,
                method: 'inline_marker_extraction',
                citations_found: markerMatches ? markerMatches.length : 0,
                unique_sources: sourcesUsed.length
            };
        } catch (error) {
            return {
                answer: llmResponse,
                sourcesUsed: [],
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = {
    EnhancedChunker,
    QueryClassifier,
    PromptEnhancer
};