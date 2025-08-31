// Delete single document with complete cleanup
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    
    // Get document and its chunks before deletion
    const document = await DocumentDatabase.getDocumentById(documentId);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    // Get all vector IDs for this document from Qdrant payload
    // Qdrant vector IDs are integers starting from 0 for each document
    const chunksQuery = `
      SELECT chunk_index, vector_id FROM document_chunks 
      WHERE document_id = $1 
      ORDER BY chunk_index
    `;
    const { rows: chunks } = await DocumentDatabase.pool.query(chunksQuery, [documentId]);
    
    // Delete vectors from Qdrant first
    let deletedVectors = 0;
    if (chunks.length > 0) {
      try {
        // For our system, vector IDs are sequential integers per document
        // We need to find and delete the actual Qdrant point IDs
        
        // Get all points from Qdrant to find ones belonging to this document
        const searchResponse = await axios.post('http://172.17.0.1:6333/collections/compliance_docs/points/scroll', {
          filter: {
            must: [{
              key: "doc_id",
              match: { value: document.filename.replace('.', '_').replace('-', '_') } // Approximate doc_id matching
            }]
          },
          limit: 1000,
          with_payload: true,
          with_vector: false
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });

        const pointsToDelete = searchResponse.data.result.points || [];
        
        if (pointsToDelete.length > 0) {
          const vectorIds = pointsToDelete.map(p => p.id);
          
          // Delete vectors from Qdrant
          await axios.post('http://172.17.0.1:6333/collections/compliance_docs/points/delete', {
            points: vectorIds
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          
          deletedVectors = vectorIds.length;
        }
      } catch (qdrantError) {
        console.error('Qdrant cleanup error:', qdrantError.message);
        // Continue with database deletion even if Qdrant cleanup fails
      }
    }

    // Delete document from database (this cascades to chunks and logs)
    const result = await DocumentDatabase.deleteDocument(documentId);
    
    res.json({
      success: true,
      message: 'Document deleted successfully',
      deletedDocument: result.deletedDocument?.filename || document.filename,
      deletedChunks: chunks.length,
      deletedVectors: deletedVectors
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete document',
      details: error.message
    });
  }
});

// Delete all documents with complete cleanup
app.delete('/api/documents', async (req, res) => {
  try {
    // Get current document and chunk counts
    const { rows: docCount } = await DocumentDatabase.pool.query('SELECT COUNT(*) as count FROM documents');
    const { rows: chunkCount } = await DocumentDatabase.pool.query('SELECT COUNT(*) as count FROM document_chunks');
    
    const totalDocuments = parseInt(docCount[0].count);
    const totalChunks = parseInt(chunkCount[0].count);
    
    // Clear all vectors from Qdrant
    let deletedVectors = 0;
    try {
      // Get current vector count
      const qdrantStatus = await axios.get('http://172.17.0.1:6333/collections/compliance_docs');
      deletedVectors = qdrantStatus.data.result.points_count;
      
      // Delete and recreate collection (fastest way to clear all vectors)
      await axios.delete('http://172.17.0.1:6333/collections/compliance_docs');
      await axios.put('http://172.17.0.1:6333/collections/compliance_docs', {
        vectors: { size: 384, distance: "Cosine" }
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (qdrantError) {
      console.error('Qdrant cleanup error:', qdrantError.message);
      // Continue with database deletion even if Qdrant cleanup fails
    }

    // Delete all documents from database
    await DocumentDatabase.deleteAllDocuments();
    
    res.json({
      success: true,
      message: 'All documents deleted successfully',
      deletedDocuments: totalDocuments,
      deletedChunks: totalChunks,
      deletedVectors: deletedVectors
    });
  } catch (error) {
    console.error('Error deleting all documents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete all documents',
      details: error.message
    });
  }
});