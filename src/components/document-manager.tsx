import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileText, Trash2, Eye, Plus, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CodeDocument {
  id: string;
  name: string;
  type: string;
  size: string;
  uploadDate: string;
  status: 'active' | 'processing' | 'error';
  chunks?: number;
}

export function DocumentManager() {
  const [documents, setDocuments] = useState<CodeDocument[]>([]);
  const [showRemoveAllDialog, setShowRemoveAllDialog] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const fileArray = Array.from(files);
    
    // Add files to uploading state
    const newUploadingIds = new Set(uploadingFiles);
    const fileUploads = fileArray.map(file => {
      const tempId = Date.now().toString() + Math.random();
      newUploadingIds.add(tempId);
      
      // Add to documents list with processing status
      const newDoc: CodeDocument = {
        id: tempId,
        name: file.name,
        type: 'Processing...',
        size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
        uploadDate: new Date().toISOString().split('T')[0],
        status: 'processing'
      };
      
      setDocuments(prev => [...prev, newDoc]);
      return { file, tempId };
    });

    setUploadingFiles(newUploadingIds);

    // Process each file
    for (const { file, tempId } of fileUploads) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('http://35.209.113.236:3001/api/upload-document', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success) {
          // Update document with success info
          setDocuments(prev => 
            prev.map(doc => 
              doc.id === tempId 
                ? { 
                    ...doc, 
                    status: 'active' as const, 
                    type: 'Compliance Document',
                    chunks: data.data?.total_chunks ? parseInt(data.data.total_chunks) : undefined
                  }
                : doc
            )
          );
          
          toast({
            title: "Upload Successful",
            description: `${file.name} processed successfully. ${data.data?.total_chunks || 'Multiple'} chunks created.`,
          });
        } else {
          throw new Error(data.error || 'Upload processing failed');
        }
      } catch (error) {
        console.error('Upload error:', error);
        
        // Update document with error status
        setDocuments(prev => 
          prev.map(doc => 
            doc.id === tempId 
              ? { ...doc, status: 'error' as const, type: 'Upload Failed' }
              : doc
          )
        );
        
        toast({
          title: "Upload Failed",
          description: `Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: "destructive",
        });
      } finally {
        // Remove from uploading set
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

  const removeDocument = async (id: string) => {
    // In a real implementation, you might call a delete API here
    setDocuments(prev => prev.filter(doc => doc.id !== id));
    toast({
      title: "Document Removed",
      description: "The document has been removed from the system.",
    });
  };

  const removeAllDocuments = async () => {
    // In a real implementation, you might call a clear API here
    setDocuments([]);
    setShowRemoveAllDialog(false);
    toast({
      title: "All Documents Removed",
      description: "All code documents have been removed from the system.",
      variant: "destructive",
    });
  };

  const viewDocument = (doc: CodeDocument) => {
    toast({
      title: "Document Viewer",
      description: `Opening ${doc.name} in viewer...`,
    });
  };

  const getStatusBadge = (status: CodeDocument['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-accent text-accent-foreground">Active</Badge>;
      case 'processing':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Processing</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-soft border-border/50">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-foreground">
            Document Upload & Management
          </CardTitle>
          <CardDescription>
            Upload compliance documents (PDF, DOCX, TXT) to build your searchable knowledge base. Documents are processed and indexed for semantic search.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="file-upload" className="cursor-pointer">
                <Button asChild size="lg" className="w-full">
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Documents
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
                  disabled={documents.length === 0}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove All
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove All Documents</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to remove all documents? This will clear your knowledge base and affect search functionality.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowRemoveAllDialog(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={removeAllDocuments}>
                    Remove All Documents
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="text-sm text-muted-foreground">
            <p>Supported formats: PDF, Word Documents (DOCX), Text files (TXT)</p>
            <p>Maximum file size: 50MB per file</p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Document Library ({documents.length})</span>
          </CardTitle>
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
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Document
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
                      <h4 className="font-medium text-foreground">{doc.name}</h4>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span>{doc.type}</span>
                        <span>{doc.size}</span>
                        <span>Uploaded {doc.uploadDate}</span>
                        {doc.chunks && (
                          <span className="text-accent">{doc.chunks} chunks</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    {getStatusBadge(doc.status)}
                    
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => viewDocument(doc)}
                        disabled={doc.status !== 'active'}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocument(doc.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
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
