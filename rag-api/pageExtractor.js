// Use older, compatible versions
const axios = require('axios');
const fs = require('fs');

class PageExtractor {
    constructor(tikaUrl = 'http://35.209.113.236:9998') {
        this.tikaUrl = tikaUrl;
    }

    /**
     * Extract text with page information from a document
     * @param {Buffer} fileBuffer - The file buffer
     * @param {string} filename - The filename
     * @returns {Object} - { text, pages, metadata }
     */
    async extractWithPages(fileBuffer, filename) {
        try {
            // First get metadata to know total pages
            const metadata = await this.extractMetadata(fileBuffer, filename);
            
            // Extract HTML with page divisions
            const htmlContent = await this.extractHTML(fileBuffer, filename);
            
            // Parse pages from HTML
            const pages = this.parsePages(htmlContent);
            
            // Combine all text for backward compatibility
            const fullText = pages.map(p => p.text).join('\n\n');
            
            return {
                text: fullText,
                pages: pages,
                metadata: metadata,
                pageCount: pages.length || metadata.pageCount
            };
        } catch (error) {
            console.error('Page extraction error:', error);
            // Fallback to simple text extraction
            return this.fallbackExtraction(fileBuffer, filename);
        }
    }

    async extractMetadata(fileBuffer, filename) {
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('file', fileBuffer, filename);
        
        const response = await axios.post(
            `${this.tikaUrl}/meta/form`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Accept': 'application/json'
                },
                timeout: 60000
            }
        );
        
        return {
            pageCount: response.data['xmpTPg:NPages'] || null,
            title: response.data['dc:title'] || null,
            author: response.data['dc:creator'] || null,
            created: response.data['dcterms:created'] || null,
            charsPerPage: response.data['pdf:charsPerPage'] || []
        };
    }

    async extractHTML(fileBuffer, filename) {
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('file', fileBuffer, filename);
        
        const response = await axios.post(
            `${this.tikaUrl}/tika/form`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Accept': 'text/html',
                    'X-Tika-PDFsortByPosition': 'true',
                    'X-Tika-PDFextractAnnotationText': 'true'
                },
                timeout: 120000
            }
        );
        
        return response.data;
    }

    parsePages(htmlContent) {
        const pages = [];
        
        // Extract all page content first
        const pageRegex = /<div class="page">(.*?)<\/div>/gs;
        const rawPages = [];
        let match;
        
        while ((match = pageRegex.exec(htmlContent)) !== null) {
            let pageText = match[1].replace(/<[^>]*>/g, '').trim();
            pageText = this.decodeHtmlEntities(pageText);
            if (pageText) {
                rawPages.push(pageText);
            }
        }
        
        // Now intelligently assign page numbers
        for (let i = 0; i < rawPages.length; i++) {
            const pageText = rawPages[i];
            const detectedPageNum = this.detectPageNumber(pageText, i, rawPages);
            
            pages.push({
                pageNumber: detectedPageNum,
                text: pageText,
                charCount: pageText.length
            });
        }
        
        // If no page divs found, extract all text from body
        if (pages.length === 0) {
            const bodyMatch = htmlContent.match(/<body[^>]*>(.*?)<\/body>/s);
            if (bodyMatch) {
                const bodyText = bodyMatch[1].replace(/<[^>]*>/g, '').trim();
                if (bodyText) {
                    pages.push({
                        pageNumber: 1,
                        text: bodyText,
                        charCount: bodyText.length
                    });
                }
            }
        }
        
        return pages;
    }

    detectPageNumber(pageText, pageIndex, allPages) {
        // DUAL VALIDATION APPROACH
        // Get both detected and derived numbers, then reconcile
        
        const detectedNumber = this.detectPageFromText(pageText);
        const derivedNumber = this.deriveSequentialPageNumber(pageIndex, allPages);
        
        // Reconcile with preference for detected (if sane)
        return this.reconcilePageNumbers(detectedNumber, derivedNumber, pageIndex, allPages.length);
    }

    detectPageFromText(pageText) {
        // Look for actual page numbers in the document text
        const explicitPagePatterns = [
            /^\s*(\d+)\s*$/m,           // Just a number on its own line
            /\n\s*(\d+)\s*$/,           // Number at end of page
            /^\s*(\d+)\s*\n/,           // Number at start of page
            /^\s*Page\s*(\d+)/i,        // "Page 5" format
            /Page\s*(\d+)/i             // "Page 5" anywhere
        ];
        
        for (const pattern of explicitPagePatterns) {
            const match = pageText.match(pattern);
            if (match) {
                const pageNum = parseInt(match[1]);
                if (pageNum > 0 && pageNum <= 200) { // Basic range check
                    return pageNum;
                }
            }
        }
        
        return null; // No reliable page number detected
    }

    deriveSequentialPageNumber(pageIndex, allPages) {
        // Find the first anchor page number and calculate offset
        const anchor = this.findPageAnchor(allPages);
        
        if (anchor) {
            // Calculate page number based on anchor
            const offset = anchor.pageNumber - anchor.pageIndex - 1; // -1 for 0-based index
            const derivedPage = pageIndex + 1 + offset;
            return derivedPage > 0 ? derivedPage : null; // null for cover pages
        }
        
        // Fallback: assume first page is page 1
        return pageIndex + 1;
    }

    findPageAnchor(allPages) {
        // Look for a reliable page number in the first 10 pages to establish sequence
        for (let i = 0; i < Math.min(10, allPages.length); i++) {
            const pageText = allPages[i];
            const detectedNum = this.detectPageFromText(pageText);
            
            if (detectedNum && detectedNum > 0 && detectedNum <= 50) {
                // Verify with next page if available
                if (i + 1 < allPages.length) {
                    const nextDetected = this.detectPageFromText(allPages[i + 1]);
                    if (nextDetected === detectedNum + 1) {
                        // Found sequential pair - this is our anchor!
                        return {
                            pageIndex: i,
                            pageNumber: detectedNum,
                            confidence: 1.0
                        };
                    }
                }
                
                // Single detection - lower confidence but still useful
                return {
                    pageIndex: i,
                    pageNumber: detectedNum,
                    confidence: 0.7
                };
            }
        }
        
        return null; // No reliable anchor found
    }

    reconcilePageNumbers(detected, derived, pageIndex, totalPages) {
        // If both agree, perfect!
        if (detected === derived) {
            return detected; // BINGO! Both methods agree
        }
        
        // If detected exists and passes sanity check, prefer it
        if (detected && this.sanityCheckPageNumber(detected, derived, pageIndex, totalPages)) {
            return detected; // Trust the detected number
        }
        
        // Otherwise use derived as fallback
        return derived;
    }

    sanityCheckPageNumber(detected, derived, pageIndex, totalPages) {
        // Rule 1: Must be reasonable for document size
        if (detected < 1 || detected > totalPages * 2) {
            console.log(`Sanity check FAILED: Page ${detected} unreasonable for ${totalPages} page document`);
            return false; // 850 fails here!
        }
        
        // Rule 2: Should be somewhat close to expected position
        const expectedRange = [pageIndex - 10, pageIndex + 20]; // Allow generous offset
        if (detected < expectedRange[0] || detected > expectedRange[1]) {
            console.log(`Sanity check FAILED: Page ${detected} too far from expected position ${pageIndex}`);
            return false; // Page "150" at position 36 fails here
        }
        
        // Rule 3: Check if number appears to be a measurement/size rather than page number
        // Look for context clues around the detected number
        if (this.looksLikeMeasurement(detected, pageText)) {
            console.log(`Sanity check FAILED: Page ${detected} appears to be a measurement, not page number`);
            return false;
        }
        
        // Rule 4: If we have a derived number, detected shouldn't be wildly different
        if (derived && Math.abs(detected - derived) > 15) {
            console.log(`Sanity check FAILED: Page ${detected} too different from derived ${derived}`);
            return false;
        }
        
        // Passes all sanity checks
        console.log(`Sanity check PASSED: Page ${detected} looks valid`);
        return true;
    }

    looksLikeMeasurement(number, pageText) {
        // Check if the number appears with measurement units or in measurement context
        const measurementPatterns = [
            new RegExp(`${number}\\s*(sq|square)\\s*(ft|feet|foot)`, 'i'),
            new RegExp(`${number}\\s*(cubic|cu)\\s*(ft|feet|foot)`, 'i'),
            new RegExp(`${number}\\s*(linear|lin)\\s*(ft|feet|foot)`, 'i'),
            new RegExp(`${number}\\s*(square|sq)\\s*meters?`, 'i'),
            new RegExp(`${number}\\s*(inches?|in\\.?)`, 'i'),
            new RegExp(`${number}\\s*('|"|ft|feet)`, 'i'),
            new RegExp(`${number}\\s*pounds?`, 'i'),
            new RegExp(`${number}\\s*(gallons?|gal)`, 'i'),
            new RegExp(`${number}\\s*(degrees?|°)`, 'i'),
            new RegExp(`maximum.*${number}`, 'i'),
            new RegExp(`minimum.*${number}`, 'i'),
            new RegExp(`at least\\s*${number}`, 'i'),
            new RegExp(`up to\\s*${number}`, 'i'),
            new RegExp(`${number}\\s*(percent|%)`, 'i')
        ];
        
        for (const pattern of measurementPatterns) {
            if (pattern.test(pageText)) {
                return true; // This number is likely a measurement
            }
        }
        
        return false; // Doesn't look like a measurement
    }

    decodeHtmlEntities(text) {
        // Decode common HTML entities to proper characters
        const entityMap = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&apos;': "'",
            '&ldquo;': '"',      // Left double quotation mark
            '&rdquo;': '"',      // Right double quotation mark
            '&lsquo;': "'",      // Left single quotation mark
            '&rsquo;': "'",      // Right single quotation mark
            '&ndash;': '–',      // En dash
            '&mdash;': '—',      // Em dash
            '&hellip;': '...',   // Horizontal ellipsis
            '&nbsp;': ' ',       // Non-breaking space
            '&copy;': '©',       // Copyright
            '&reg;': '®',        // Registered trademark
            '&trade;': '™',      // Trademark
            '&bull;': '•',       // Bullet
            '&laquo;': '«',      // Left angle quotation mark
            '&raquo;': '»',      // Right angle quotation mark
        };
        
        let decodedText = text;
        for (const [entity, char] of Object.entries(entityMap)) {
            decodedText = decodedText.replace(new RegExp(entity, 'g'), char);
        }
        
        // Handle numeric entities like &#8220; &#8221;
        decodedText = decodedText.replace(/&#(\d+);/g, (match, dec) => {
            return String.fromCharCode(parseInt(dec, 10));
        });
        
        // Handle hex entities like &#x201C;
        decodedText = decodedText.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
        });
        
        return decodedText;
    }

    findSequentialPageHints(allPages) {
        const hints = [];
        
        // Look for pages that contain obvious page numbers
        for (let i = 0; i < allPages.length; i++) {
            const pageText = allPages[i];
            
            // Find any numbers that could be page numbers
            const numberMatches = pageText.match(/\b(\d+)\b/g);
            if (numberMatches) {
                for (const numStr of numberMatches) {
                    const num = parseInt(numStr);
                    if (num > 0 && num <= allPages.length + 5) { // Reasonable range
                        hints.push({
                            pageIndex: i,
                            pageNumber: num,
                            confidence: this.calculatePageNumberConfidence(pageText, num, i)
                        });
                    }
                }
            }
        }
        
        // Sort by confidence and return best matches
        return hints.filter(h => h.confidence > 0.5).sort((a, b) => b.confidence - a.confidence);
    }

    calculatePageNumberConfidence(pageText, pageNum, pageIndex) {
        let confidence = 0.3; // Base confidence
        
        // Higher confidence if number is isolated
        if (pageText.match(new RegExp(`^\\s*${pageNum}\\s*$`, 'm'))) {
            confidence += 0.4;
        }
        
        // Higher confidence if number is at start/end of page
        if (pageText.startsWith(pageNum.toString()) || pageText.endsWith(pageNum.toString())) {
            confidence += 0.2;
        }
        
        // Higher confidence if the relationship between pageIndex and pageNum makes sense
        const expectedRelation = pageNum - pageIndex;
        if (expectedRelation >= 0 && expectedRelation <= 2) { // Allow for cover pages
            confidence += 0.3;
        }
        
        return Math.min(confidence, 1.0);
    }

    smartFallbackPageNumber(pageText, pageIndex, allPages) {
        // Check if this looks like a cover page (no page number expected)
        const coverPageIndicators = [
            /handbook/i, /manual/i, /guide/i, /report/i,
            /title/i, /cover/i, /front/i,
            /courtesy/i, /copyright/i, /published/i
        ];
        
        const isCoverPage = coverPageIndicators.some(pattern => pattern.test(pageText));
        
        if (isCoverPage && pageIndex < 2) {
            return null; // No page number for cover pages
        }
        
        // Default: assume first real content page is page 1
        return pageIndex + 1 - this.estimateCoverPages(allPages);
    }

    estimateCoverPages(allPages) {
        if (allPages.length === 0) return 0;
        
        let coverPageCount = 0;
        
        // Check first few pages for cover page indicators
        for (let i = 0; i < Math.min(3, allPages.length); i++) {
            const pageText = allPages[i];
            
            if (pageText.length < 200) { // Short pages might be covers
                coverPageCount++;
            } else if (this.hasCoverPageContent(pageText)) {
                coverPageCount++;
            } else {
                break; // First substantial content page found
            }
        }
        
        return coverPageCount;
    }

    hasCoverPageContent(pageText) {
        const coverIndicators = [
            /courtesy/i, /images courtesy/i, /copyright/i, /©/,
            /handbook|manual|guide|report/i,
            /september|october|november|december|january|february/i
        ];
        
        return coverIndicators.some(pattern => pattern.test(pageText)) && pageText.length < 500;
    }

    async fallbackExtraction(fileBuffer, filename) {
        const FormData = require('form-data');
        const formData = new FormData();
        formData.append('file', fileBuffer, filename);
        
        const response = await axios.post(
            `${this.tikaUrl}/tika/form`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Accept': 'text/plain'
                },
                timeout: 60000
            }
        );
        
        return {
            text: response.data,
            pages: [{
                pageNumber: null,
                text: response.data,
                charCount: response.data.length
            }],
            metadata: {},
            pageCount: null
        };
    }

    /**
     * Calculate which page a chunk belongs to based on character position
     * @param {number} chunkStartPos - Starting character position of chunk
     * @param {Array} pages - Array of page objects with text
     * @returns {number|null} - Page number or null if not found
     */
    findPageForChunk(chunkStartPos, pages) {
        let currentPos = 0;
        
        for (const page of pages) {
            const pageEndPos = currentPos + page.charCount;
            
            if (chunkStartPos >= currentPos && chunkStartPos < pageEndPos) {
                return page.pageNumber;
            }
            
            currentPos = pageEndPos + 2; // Account for \n\n between pages
        }
        
        return null;
    }

    /**
     * Extract section headers from text
     * @param {string} text - The text to analyze
     * @returns {Array} - Array of {section, position}
     */
    extractSections(text) {
        const sections = [];
        
        // Multi-strategy section detection
        const strategies = [
            this.extractFormalSections.bind(this),
            this.extractQuestionSections.bind(this),
            this.extractHeadingSections.bind(this),
            this.extractNumberedSections.bind(this)
        ];
        
        for (const strategy of strategies) {
            const foundSections = strategy(text);
            sections.push(...foundSections);
        }
        
        // Remove duplicates and sort by position
        const uniqueSections = this.deduplicateSections(sections);
        return uniqueSections.sort((a, b) => a.position - b.position);
    }

    extractFormalSections(text) {
        const sections = [];
        
        // Formal document sections
        const formalPatterns = [
            /^(Chapter|Section|Article|Part|Appendix)\s+([A-Z0-9]+\.?[0-9]*)\s*:?\s*(.{0,100})/gmi,
            /^(\d+\.[\d.]*)\s+([A-Z].{3,80})/gm,  // "1.2.3 Title Text"
            /^([A-Z]\.\s*[A-Z0-9\.]*)\s+([A-Z].{3,80})/gm  // "A.1 Title Text"
        ];
        
        formalPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                sections.push({
                    section: match[0].trim().substring(0, 100), // Limit length
                    position: match.index,
                    type: 'formal',
                    confidence: 0.9
                });
            }
        });
        
        return sections;
    }

    extractQuestionSections(text) {
        const sections = [];
        
        // Question-based sections (common in handbooks/FAQs)
        const questionPattern = /^[\s•]*([A-Z].{10,200}\?)\s*$/gm;
        let match;
        
        while ((match = questionPattern.exec(text)) !== null) {
            const question = match[1].trim();
            // Filter out very long or short questions
            if (question.length >= 15 && question.length <= 150) {
                sections.push({
                    section: question,
                    position: match.index,
                    type: 'question',
                    confidence: 0.8
                });
            }
        }
        
        return sections;
    }

    extractHeadingSections(text) {
        const sections = [];
        
        // Heading-style sections
        const headingPatterns = [
            /^([A-Z][A-Za-z\s]{5,80})$/gm,  // Title Case headings on their own line
            /^\*\*([A-Z].{5,80})\*\*$/gm,    // Bold markdown headings
            /^#{1,3}\s+(.{5,80})$/gm         // Markdown headers
        ];
        
        headingPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const heading = (match[1] || match[0]).trim();
                
                // Filter out common false positives
                if (!this.isLikelyFalsePositive(heading)) {
                    sections.push({
                        section: heading,
                        position: match.index,
                        type: 'heading',
                        confidence: 0.7
                    });
                }
            }
        });
        
        return sections;
    }

    extractNumberedSections(text) {
        const sections = [];
        
        // Numbered list items that might be sections
        const numberedPattern = /^[\s•]*(\d+\.\s+[A-Z].{5,100})$/gm;
        let match;
        
        while ((match = numberedPattern.exec(text)) !== null) {
            sections.push({
                section: match[1].trim(),
                position: match.index,
                type: 'numbered',
                confidence: 0.6
            });
        }
        
        return sections;
    }

    isLikelyFalsePositive(text) {
        const falsePositives = [
            /^\d+\s*$/,  // Just numbers
            /^[A-Z]\s*$/,  // Single letters
            /california|government|code|section/i,  // Common words that aren't section titles
            /shall|must|may|should|will|can/i,  // Legal/regulatory language
            /the|and|or|of|in|to|for|with|by|from/i  // Common articles/prepositions
        ];
        
        return falsePositives.some(pattern => pattern.test(text.trim()));
    }

    deduplicateSections(sections) {
        const seen = new Set();
        const unique = [];
        
        sections.forEach(section => {
            const key = section.section.toLowerCase().trim();
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(section);
            }
        });
        
        // Prefer higher confidence sections
        return unique.sort((a, b) => (b.confidence || 0.5) - (a.confidence || 0.5));
    }

    /**
     * Find the section for a given text position
     * @param {number} position - Character position in text
     * @param {Array} sections - Array of section objects
     * @returns {string|null} - Section name or null
     */
    findSectionForPosition(position, sections) {
        let currentSection = null;
        
        for (const section of sections) {
            if (section.position <= position) {
                currentSection = section.section;
            } else {
                break;
            }
        }
        
        return currentSection;
    }
}

module.exports = { PageExtractor };