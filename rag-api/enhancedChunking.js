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
        const scores = rerankedChunks.map(c => c.rerank_score);
        const topScore = scores[0] || 0;
        const dropoff = scores.length > 4 ? scores[0] - scores[4] : 0;

        // Default count
        let numChunks = 3;

        // High confidence single answer
        if (queryType === 'definition' && topScore > -1.0) {
            numChunks = 1;
        }
        // Specific section reference
        else if (queryType === 'specific_section' && topScore > -1.5) {
            numChunks = 2;
        }
        // Comprehensive queries need more context
        else if (queryType === 'list' || queryType === 'procedure') {
            numChunks = 5;
        }
        // Score distribution analysis
        else if (dropoff > 3.0) {
            numChunks = 2; // Sharp dropoff = only top chunks relevant
        }
        else if (dropoff < 1.0) {
            numChunks = 4; // Flat distribution = need more context
        }

        return Math.min(numChunks, rerankedChunks.length);
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