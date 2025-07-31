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
}

export function DocumentManager() {
  const [documents, setDocuments] = useState<CodeDocument[]>([
    {
      id: '1',
      name: 'International Building Code (IBC) 2021',
      type: 'Building Code',
      size: '2.4 MB',
      uploadDate: '2024-01-15',
      status: 'active'
    },
    {
      id: '2',
      name: 'Americans with Disabilities Act (ADA) Standards',
      type: 'Accessibility Code',
      size: '1.8 MB',
      uploadDate: '2024-01-10',
      status: 'active'
    },
    {
      id: '3',
      name: 'NFPA 101 Life Safety Code',
      type: 'Fire Safety',
      size: '3.1 MB',
      uploadDate: '2024-01-08',
      status: 'processing'
    }
  ]);
  
  const [showRemoveAllDialog, setShowRemoveAllDialog] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const newDoc: CodeDocument = {
        id: Date.now().toString() + Math.random(),
        name: file.name,
        type: 'Unknown',
        size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
        uploadDate: new Date().toISOString().split('T')[0],
        status: 'processing'
      };
      
      setDocuments(prev => [...prev, newDoc]);
      
      // Simulate processing
      setTimeout(() => {
        setDocuments(prev => 
          prev.map(doc => 
            doc.id === newDoc.id 
              ? { ...doc, status: 'active' as const, type: 'Code Document' }
              : doc
          )
        );
      }, 2000);
    });

    toast({
      title: "Upload Started",
      description: `Uploading ${files.length} document(s). Processing will begin shortly.`,
    });
  };

  const removeDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
    toast({
      title: "Document Removed",
      description: "The document has been removed from the system.",
    });
  };

  const removeAllDocuments = () => {
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
            Code Document Management
          </CardTitle>
          <CardDescription>
            Upload, view, and manage building codes and standards documents used for compliance checking.
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
                    Are you sure you want to remove all code documents? This action cannot be undone and will affect compliance checking functionality.
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
        </CardContent>
      </Card>

      <Card className="shadow-soft border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Current Documents ({documents.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Documents</h3>
              <p className="text-muted-foreground mb-4">
                Upload code documents to start checking compliance.
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