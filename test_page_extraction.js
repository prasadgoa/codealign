const { PageExtractor } = require('./rag-api/pageExtractor');
const fs = require('fs').promises;

async function testPageExtraction() {
    const extractor = new PageExtractor();
    
    // Test with NCD_NFPA_704.pdf
    console.log('Testing with NCD_NFPA_704.pdf...\n');
    const pdfPath = '/opt/rag-api/uploads/1756938253313_364f9b3e0dd89b09.pdf';
    const pdfBuffer = await fs.readFile(pdfPath);
    
    const result = await extractor.extractWithPages(pdfBuffer, 'NCD_NFPA_704.pdf');
    
    console.log('Metadata:', result.metadata);
    console.log('Total pages found:', result.pages.length);
    console.log('Page count from metadata:', result.pageCount);
    
    // Show info for each page
    result.pages.forEach(page => {
        console.log(`\nPage ${page.pageNumber}:`);
        console.log(`  Characters: ${page.charCount}`);
        console.log(`  First 100 chars: ${page.text.substring(0, 100)}...`);
    });
    
    // Test section extraction
    console.log('\n\nSection extraction test:');
    const sections = extractor.extractSections(result.text);
    console.log('Found sections:', sections.slice(0, 5));
    
    // Test finding page for a chunk position
    const testPosition = 1500; // Character position in middle of document
    const pageNum = extractor.findPageForChunk(testPosition, result.pages);
    console.log(`\nCharacter position ${testPosition} is on page ${pageNum}`);
    
    // Test with DOCX file
    console.log('\n\n========================================');
    console.log('Testing with Mo Co Fire Code DOCX...\n');
    const docxPath = '/opt/rag-api/uploads/1756938194706_2bc764558c4763c7.docx';
    const docxBuffer = await fs.readFile(docxPath);
    
    const docxResult = await extractor.extractWithPages(docxBuffer, '2023 Mo Co Fire Code.docx');
    console.log('DOCX Total pages found:', docxResult.pages.length);
    console.log('DOCX sections found:', extractor.extractSections(docxResult.text).slice(0, 5));
}

testPageExtraction().catch(console.error);