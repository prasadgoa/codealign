import { useState } from 'react';
import { Header } from '@/components/header';
import { ComplianceChecker } from '@/components/compliance-checker';
import { DocumentManager } from '@/components/document-manager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileCheck, FolderOpen } from 'lucide-react';

const Index = () => {
  const [activeTab, setActiveTab] = useState('checker');

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
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto bg-card shadow-soft">
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
          </TabsList>

          <TabsContent value="checker">
            <ComplianceChecker />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentManager />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
