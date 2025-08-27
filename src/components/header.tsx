import { FileCheck } from 'lucide-react';

export function Header() {
  return (
    <header className="bg-card border-b border-border/50 shadow-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-gradient-primary">
              <FileCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">CodeAlign</h1>
              <p className="text-sm text-muted-foreground">Building Code Compliance System</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}