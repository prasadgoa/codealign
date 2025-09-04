const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function testExtraction() {
    try {
        // Read the test PDF
        const fileBuffer = fs.readFileSync('/opt/rag-api/uploads/1756938253313_364f9b3e0dd89b09.pdf');
        
        // Get HTML with pages
        const formData = new FormData();
        formData.append('file', fileBuffer, 'test.pdf');
        
        console.log('Extracting HTML with page divisions...');
        const response = await axios.post(
            'http://35.209.113.236:9998/tika/form',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Accept': 'text/html'
                },
                timeout: 30000
            }
        );
        
        const html = response.data;
        
        // Count page divs
        const pageMatches = html.match(/<div class="page">/g) || [];
        console.log('Pages found:', pageMatches.length);
        
        // Extract text from each page
        const pageRegex = /<div class="page">(.*?)<\/div>/gs;
        let match;
        let pageNum = 1;
        
        while ((match = pageRegex.exec(html)) !== null) {
            // Remove HTML tags
            const pageText = match[1].replace(/<[^>]*>/g, '').trim();
            console.log(`\nPage ${pageNum}:`);
            console.log(`  Characters: ${pageText.length}`);
            console.log(`  Preview: ${pageText.substring(0, 80)}...`);
            pageNum++;
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testExtraction();