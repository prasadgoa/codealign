import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileText, Trash2, Eye, Plus, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CodeDocument {
  id: number;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  upload_date: string;
  processing_status: 'processing' | 'completed' | 'failed';
  total_chunks: number;
  actual_chunks?: number;
  created_at: string;
  updated_at: string;
}

interface ApiResponse<T> {
  success: boolean;
  documents?: T[];
  document?: T;
  error?: string;
  message?: string;
  deletedDocument?: string;
  deletedChunks?: number;
  deletedVectors?: number;
  deletedDocuments?: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export function DocumentManager() {
  const [documents, setDocuments] = useState<CodeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const [showRemoveAllDialog, setShowRemoveAllDialog] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState<number | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const { toast } = useToast();

  // Load documents from database
  const loadDocuments = async () => {
    try {
      const response = await fetch('http://35.209.113.236:3001/api/documents?limit=100');
      const data: ApiResponse<CodeDocument> = await response.json();
      
      if (data.success && data.documents) {
        setDocuments(data.documents);
      } else {
        throw new Error(data.error || 'Failed to load documents');
      }
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: "Load Error",
        description: "Failed to load documents from database.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Load documents on component mount
  useEffect(() => {
    loadDocuments();
  }, []);

  // Poll for document status updates
  const pollDocumentStatus = async (documentId: number, filename: string, expectedChunks: number, processingTime?: number) => {
    let attempts = 0;
    const maxAttempts = 60; // Poll for up to 60 seconds for large documents
    const pollInterval = 1000; // Poll every second
    
    const poll = async () => {
      attempts++;
      
      try {
        const response = await fetch(`http://35.209.113.236:3001/api/documents/${documentId}`);
        const data: ApiResponse<CodeDocument> = await response.json();
        
        if (data.success && data.document) {
          const doc = data.document;
          
          // Update document in state
          setDocuments(prev => prev.map(d => 
            d.id === documentId ? { ...d, ...doc } : d
          ));
          
          // Check if processing is complete
          if (doc.processing_status === 'completed') {
            toast({
              title: "Upload Successful",
              description: `${filename} uploaded successfully. ${doc.total_chunks || expectedChunks} chunks created${processingTime ? ` in ${processingTime}ms` : ''}.`,
            });
            return; // Stop polling
          } else if (doc.processing_status === 'failed') {
            toast({
              title: "Processing Failed",
              description: `Failed to process ${filename}. Please try again.`,
              variant: "destructive",
            });
            // Update failed document status but keep in list for visibility
            setDocuments(prev => prev.map(d => 
              d.id === documentId ? { ...d, processing_status: 'failed' } : d
            ));
            return; // Stop polling
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
      
      // Continue polling if not complete and within max attempts
      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval);
      } else {
        // Final refresh after max attempts - document might still be processing
        toast({
          title: "Processing Taking Longer",
          description: `${filename} is still being processed. The page will refresh to check status.`,
        });
        await loadDocuments();
      }
    };
    
    // Start polling after a longer delay to allow backend to update status
    setTimeout(poll, 1500); // Increased from 500ms to 1500ms
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      const tempId = Date.now().toString() + Math.random();
      
      // Immediately add document to UI with processing status
      const tempDoc: CodeDocument = {
        id: -tempId as any, // Temporary negative ID
        filename: file.name,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        upload_date: new Date().toISOString(),
        processing_status: 'processing',
        total_chunks: 0,
        actual_chunks: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Add to documents list immediately
      setDocuments(prev => [tempDoc, ...prev]);
      setUploadingFiles(prev => new Set([...prev, tempId]));

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('http://35.209.113.236:3001/api/upload-document-direct', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        
        if (data.success) {
          // Update the temporary document with real ID and data
          setDocuments(prev => prev.map(doc => 
            doc.id === tempDoc.id ? {
              ...doc,
              id: data.document_id,
              filename: data.filename,
              original_filename: data.filename,
              // Keep processing status - will be updated by polling
            } : doc
          ));
          
          // Start polling for status updates
          pollDocumentStatus(data.document_id, file.name, data.total_chunks, data.processing_time_ms);
          
        } else {
          // Remove the temporary document on failure
          setDocuments(prev => prev.filter(doc => doc.id !== tempDoc.id));
          
          if (response.status === 409) {
            toast({
              title: "Duplicate Document",
              description: `${file.name} already exists in the system.`,
              variant: "destructive",
            });
          } else {
            throw new Error(data.error || data.message || 'Upload failed');
          }
        }
      } catch (error) {
        // Remove the temporary document on error
        setDocuments(prev => prev.filter(doc => doc.id !== tempDoc.id));
        
        console.error('Upload error:', error);
        toast({
          title: "Upload Failed",
          description: `Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: "destructive",
        });
      } finally {
        setUploadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(tempId);
          return newSet;
        });
      }
    }

    // Clear the input
    event.target.value = '';
  };

  const removeDocument = async (documentId: number, filename: string) => {
    setDeletingDocument(documentId);
    
    try {
      const response = await fetch(`http://35.209.113.236:3001/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      const data: ApiResponse<CodeDocument> = await response.json();
      
      if (data.success) {
        toast({
          title: "Document Deleted",
          description: `${data.deletedDocument || filename} removed successfully. Cleaned up ${data.deletedChunks || 0} chunks and ${data.deletedVectors || 0} vectors.`,
        });
        
        // Refresh document list
        await loadDocuments();
      } else {
        throw new Error(data.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Delete Failed",
        description: `Failed to delete ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setDeletingDocument(null);
    }
  };

  const removeAllDocuments = async () => {
    setDeletingAll(true);
    
    try {
      const response = await fetch('http://35.209.113.236:3001/api/documents', {
        method: 'DELETE',
      });

      const data: ApiResponse<CodeDocument> = await response.json();
      
      if (data.success) {
        setShowRemoveAllDialog(false);
        toast({
          title: "All Documents Deleted",
          description: `Removed ${data.deletedDocuments || 0} documents, ${data.deletedChunks || 0} chunks, and ${data.deletedVectors || 0} vectors from the system.`,
        });
        
        // Clear local state and refresh
        setDocuments([]);
        await loadDocuments();
      } else {
        throw new Error(data.error || 'Delete all failed');
      }
    } catch (error) {
      console.error('Delete all error:', error);
      setShowRemoveAllDialog(false);
      toast({
        title: "Delete Failed",
        description: `Failed to delete all documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setDeletingAll(false);
    }
  };

  const viewDocument = (doc: CodeDocument) => {
    // Open document in new tab/window
    const downloadUrl = `http://35.209.113.236:3001/api/documents/${doc.id}/download`;
    window.open(downloadUrl, '_blank');
    
    toast({
      title: "Opening Document",
      description: `Opening ${doc.original_filename} in new tab`,
    });
  };

  const getStatusBadge = (status: CodeDocument['processing_status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-accent text-accent-foreground">Active</Badge>;
      case 'processing':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive">Error</Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="shadow-soft border-border/50">
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading documents...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-soft border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-semibold text-foreground">
                Document Upload & Management
              </CardTitle>
              <CardDescription>
                Upload compliance documents (PDF, DOCX, TXT) to build your searchable knowledge base. Documents are processed and indexed for semantic search.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="file-upload" className="cursor-pointer">
                <Button 
                  asChild 
                  size="lg" 
                  className="w-full"
                  disabled={uploadingFiles.size > 0}
                >
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    {uploadingFiles.size > 0 ? 'Uploading...' : 'Upload Documents'}
                  </span>
                </Button>
              </label>
              <input
                id="file-upload"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            
            <Dialog open={showRemoveAllDialog} onOpenChange={setShowRemoveAllDialog}>
              <DialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  size="lg"
                  disabled={documents.length === 0 || deletingAll}
                >
                  {deletingAll ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove All
                    </>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove All Documents</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to remove all {documents.length} documents? This will clear your knowledge base and all associated vectors from the search index.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowRemoveAllDialog(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={removeAllDocuments} disabled={deletingAll}>
                    {deletingAll ? 'Deleting...' : 'Remove All Documents'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="mt-4 text-sm text-muted-foreground space-y-1">
            <p>Supported formats: PDF, Word Documents (DOCX), Text files (TXT)</p>
            <p>Maximum file size: 50MB per file</p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft border-border/50">
        <CardHeader>
          <CardTitle>Document Library</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Documents</h3>
              <p className="text-muted-foreground mb-4">
                Upload compliance documents to start building your searchable knowledge base.
              </p>
              <label htmlFor="file-upload-empty" className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span>
                    <Plus className="mr-2 h-4 w-4" />
                    Add First Document
                  </span>
                </Button>
              </label>
              <input
                id="file-upload-empty"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div 
                  key={doc.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-gradient-subtle hover:shadow-soft transition-all"
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-2 rounded-md bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">{doc.original_filename}</h4>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span>ID: {doc.id}</span>
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>Uploaded {formatDate(doc.upload_date)}</span>
                        <span className="text-accent">{doc.total_chunks} chunks</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {getStatusBadge(doc.processing_status)}
                    
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => viewDocument(doc)}
                        disabled={doc.processing_status !== 'completed' || doc.id < 0}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocument(doc.id, doc.original_filename)}
                        disabled={deletingDocument === doc.id || uploadingFiles.size > 0 || doc.id < 0}
                      >
                        {deletingDocument === doc.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin text-destructive" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}