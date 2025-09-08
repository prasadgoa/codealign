import { useState } from 'react';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { Dashboard } from '@/components/dashboard';
import { KnowledgeBase } from '@/components/knowledge-base';
import { Reports } from '@/components/reports';

const Index = () => {
  const [activeSection, setActiveSection] = useState('knowledge-base');

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <Dashboard />;
      case 'knowledge-base':
        return <KnowledgeBase />;
      case 'reports':
        return <Reports />;
      default:
        return <KnowledgeBase />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex flex-col">
      <Header 
        activeSection={activeSection} 
        onSectionChange={setActiveSection} 
      />
      
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {renderContent()}
      </main>

      <Footer />
    </div>
  );
};

export default Index;
