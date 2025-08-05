import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Header } from '@/components/header';
import { ComplianceChecker } from '@/components/compliance-checker';
import { DocumentManager } from '@/components/document-manager';
import { AdminPanel } from '@/components/AdminPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileCheck, FolderOpen, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const Index = () => {
  const [activeTab, setActiveTab] = useState('checker');
  const { user, loading } = useAuth();

  // Redirect to auth if not authenticated
  if (!loading && !user) {
    return <Navigate to="/auth" replace />;
  }

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="animate-pulse">
          <FileCheck className="h-8 w-8 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Building Code Compliance Platform
          </h2>
          <p className="text-lg text-muted-foreground">
            Analyze property descriptions against building codes and manage your compliance documents.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 max-w-2xl mx-auto bg-card shadow-soft">
            <TabsTrigger 
              value="checker" 
              className="flex items-center space-x-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground"
            >
              <FileCheck className="h-4 w-4" />
              <span>Compliance Checker</span>
            </TabsTrigger>
            <TabsTrigger 
              value="documents"
              className="flex items-center space-x-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground"
            >
              <FolderOpen className="h-4 w-4" />
              <span>Document Manager</span>
            </TabsTrigger>
            <TabsTrigger 
              value="admin"
              className="flex items-center space-x-2 data-[state=active]:bg-gradient-primary data-[state=active]:text-primary-foreground"
            >
              <Shield className="h-4 w-4" />
              <span>Admin</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="checker">
            <ComplianceChecker />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentManager />
          </TabsContent>

          <TabsContent value="admin">
            <AdminPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
