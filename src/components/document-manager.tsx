import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, FileText, Trash2, Eye, Plus, RefreshCw, Clock, CheckCircle, XCircle, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface CodeDocument {
  id: number;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  upload_date: string;
  processing_status: 'queued' | 'uploading' | 'processing' | 'completed' | 'failed';
  total_chunks: number;
  actual_chunks?: number;
  created_at: string;
  updated_at: string;
  error_message?: string;  // For failed state tooltip
  queue_position?: number;  // Position in upload queue
  temp_id?: string;  // For tracking before real ID is assigned
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
  const [deletingDocument, setDeletingDocument] = useState<number | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ show: boolean; doc: CodeDocument | null }>({ show: false, doc: null });
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

  // Helper function to update document status
  const updateDocumentStatus = (
    tempId: string | number, 
    status: CodeDocument['processing_status'], 
    realId?: number, 
    errorMessage?: string
  ) => {
    setDocuments(prev => prev.map(doc => {
      // Match by temp_id or id
      if (doc.temp_id === tempId || doc.id === tempId) {
        return {
          ...doc,
          processing_status: status,
          id: realId || doc.id,
          error_message: errorMessage,
          // Clear queue position when not queued
          queue_position: status === 'queued' ? doc.queue_position : undefined
        };
      }
      // Update queue positions for remaining queued documents
      if (status === 'uploading' && doc.processing_status === 'queued' && doc.queue_position) {
        return {
          ...doc,
          queue_position: doc.queue_position - 1
        };
      }
      return doc;
    }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const fileArray = Array.from(files);
    
    // Step 1: Add ALL files to UI immediately with appropriate statuses
    const queuedDocs = fileArray.map((file, index) => {
      const tempId = `temp_${Date.now()}_${index}`;
      return {
        id: -(Date.now() + index) as any, // Temporary negative ID
        temp_id: tempId,
        filename: file.name,
        original_filename: file.name,
        file_size: file.size,
        mime_type: file.type,
        upload_date: new Date().toISOString(),
        processing_status: (index === 0 ? 'uploading' : 'queued') as CodeDocument['processing_status'],
        total_chunks: 0,
        actual_chunks: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        queue_position: index
      };
    });
    
    // Add all documents to the UI at once
    setDocuments(prev => [...queuedDocs, ...prev]);
    
    // Step 2: Process each file sequentially
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const tempId = queuedDocs[i].temp_id!;
      
      // Update status to uploading (for files after the first)
      if (i > 0) {
        updateDocumentStatus(tempId, 'uploading');
      }
      
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
          // Update to processing status with real ID
          updateDocumentStatus(tempId, 'processing', data.document_id);
          
          // Start polling for status updates
          pollDocumentStatus(data.document_id, file.name, data.total_chunks, data.processing_time_ms);
          
        } else {
          const errorMsg = response.status === 409 
            ? 'Document already exists' 
            : data.error || data.message || 'Upload failed';
          
          // Update to failed status with error message
          updateDocumentStatus(tempId, 'failed', undefined, errorMsg);
          
          if (response.status === 409) {
            toast({
              title: "Duplicate Document", 
              description: `${truncateFilename(file.name)} already exists in the system.`,
              variant: "destructive",
            });
          } else {
            throw new Error(errorMsg);
          }
        }
      } catch (error) {
        // Update to failed status with error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        updateDocumentStatus(tempId, 'failed', undefined, errorMessage);
        
        console.error('Upload error:', error);
        toast({
          title: "Upload Failed",
          description: `Failed to upload ${truncateFilename(file.name)}: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  const handleDeleteClick = (doc: CodeDocument) => {
    setDeleteConfirmation({ show: true, doc });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation.doc) return;
    
    const documentId = deleteConfirmation.doc.id;
    const filename = deleteConfirmation.doc.original_filename;
    
    setDeletingDocument(documentId);
    setDeleteConfirmation({ show: false, doc: null });
    
    try {
      const response = await fetch(`http://35.209.113.236:3001/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      const data: ApiResponse<CodeDocument> = await response.json();
      
      if (data.success) {
        toast({
          title: "Document Deleted",
          description: `${truncateFilename(data.deletedDocument || filename)} removed successfully. Cleaned up ${data.deletedChunks || 0} chunks and ${data.deletedVectors || 0} vectors.`,
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
        description: `Failed to delete ${truncateFilename(filename)}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setDeletingDocument(null);
    }
  };


  const viewDocument = (doc: CodeDocument) => {
    // Open document in new tab/window with view action
    const viewUrl = `http://35.209.113.236:3001/api/documents/${doc.id}/download?action=view`;
    window.open(viewUrl, '_blank');
    
    toast({
      title: "Opening Document",
      description: `Opening ${truncateFilename(doc.original_filename)}`,
    });
  };

  const downloadDocument = (doc: CodeDocument) => {
    // Download document file with download action
    const downloadUrl = `http://35.209.113.236:3001/api/documents/${doc.id}/download?action=download`;
    
    // Method 1: Try without download attribute first (might trigger Save As dialog)
    const link = document.createElement('a');
    link.href = downloadUrl;
    // Intentionally NOT setting download attribute to increase chance of Save As dialog
    // link.download = doc.original_filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Alternative Method 2: If you want to try window.open instead (uncomment to test):
    // window.open(downloadUrl, '_self');
    
    toast({
      title: "Downloading Document",
      description: `Downloading ${truncateFilename(doc.original_filename)}`,
    });
  };

  const getStatusBadge = (doc: CodeDocument) => {
    const status = doc.processing_status;
    const errorMessage = doc.error_message;
    
    switch (status) {
      case 'queued':
        return (
          <Badge variant="secondary">
            Queued
            {doc.queue_position !== undefined && doc.queue_position > 0 && (
              <span className="ml-1">#{doc.queue_position + 1}</span>
            )}
          </Badge>
        );
      case 'uploading':
        return (
          <Badge variant="outline" className="animate-pulse">
            Uploading
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="outline" className="animate-pulse">
            Processing
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="default" className="bg-accent text-accent-foreground">
            Active
          </Badge>
        );
      case 'failed':
        if (errorMessage) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="destructive" className="cursor-help">
                    Failed
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">{errorMessage}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }
        return (
          <Badge variant="destructive">
            Failed
          </Badge>
        );
    }
  };

  const formatFileSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const truncateFilename = (filename: string, maxLength: number = 30) => {
    if (filename.length <= maxLength) return filename;
    
    // Try to preserve file extension
    const lastDotIndex = filename.lastIndexOf('.');
    const extension = lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';
    const nameWithoutExt = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
    
    // Calculate how much of the name we can show
    const availableLength = maxLength - extension.length - 3; // 3 for "..."
    
    if (availableLength > 0) {
      return nameWithoutExt.substring(0, availableLength) + '...' + extension;
    }
    
    // If even with extension it's too long, just truncate simply
    return filename.substring(0, maxLength - 3) + '...';
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
                Manage Knowledge Base
              </CardTitle>
              <CardDescription>
                Upload/update compliance documents (PDF, DOCX, TXT) to build your searchable knowledge base. Change status of older documents which are no longer in use to "Inactive".
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-w-md">
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
        </CardContent>
      </Card>

      <Card className="shadow-soft border-border/50">
        <CardHeader>
          <CardTitle>Manage Knowledge Base</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Upload Progress Indicator */}
          {(() => {
            const uploadingCount = documents.filter(d => ['queued', 'uploading', 'processing'].includes(d.processing_status)).length;
            const completedCount = documents.filter(d => d.processing_status === 'completed' && d.temp_id).length;
            const failedCount = documents.filter(d => d.processing_status === 'failed' && d.temp_id).length;
            const totalInBatch = documents.filter(d => d.temp_id).length;
            
            if (uploadingCount > 0 || (totalInBatch > 0 && completedCount + failedCount < totalInBatch)) {
              const progress = totalInBatch > 0 ? ((completedCount + failedCount) / totalInBatch) * 100 : 0;
              
              return (
                <div className="mb-4 p-3 border rounded-lg bg-muted/30">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">
                      Uploading {uploadingCount} {uploadingCount === 1 ? 'document' : 'documents'}
                    </span>
                    <span className="text-muted-foreground">
                      {completedCount} completed, {failedCount} failed
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              );
            }
            return null;
          })()}
          
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
                      <h4 className="font-medium text-foreground" title={doc.original_filename}>
                        {truncateFilename(doc.original_filename)}
                      </h4>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span>ID: {doc.id}</span>
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>Uploaded {formatDate(doc.upload_date)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {getStatusBadge(doc)}
                    
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
                        onClick={() => downloadDocument(doc)}
                        disabled={doc.processing_status !== 'completed' || doc.id < 0}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(doc)}
                        disabled={deletingDocument === doc.id || uploadingFiles.size > 0 || doc.id < 0 || ['queued', 'uploading', 'processing'].includes(doc.processing_status)}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmation.show} onOpenChange={(open) => setDeleteConfirmation({ show: open, doc: deleteConfirmation.doc })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirmation.doc ? truncateFilename(deleteConfirmation.doc.original_filename) : ''}"? 
              This action cannot be undone and will remove the document from your knowledge base.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteConfirmation({ show: false, doc: null })}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              disabled={deletingDocument !== null}
            >
              {deletingDocument !== null ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}