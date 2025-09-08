import { Shield, Flame, BarChart, BookOpen, FileText } from 'lucide-react';

interface HeaderProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function Header({ activeSection, onSectionChange }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="relative">
              {/* Fire Department Logo */}
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-red-600 to-red-700">
                <Flame className="h-6 w-6 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 p-1 rounded-md bg-gradient-to-br from-yellow-600 to-yellow-700">
                <Shield className="h-3 w-3 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline space-x-1">
                <h1 className="text-xl font-semibold text-gray-900">Marshal</h1>
                <span className="text-xs text-red-600 font-medium">by GoAlign</span>
              </div>
              <p className="text-sm text-gray-600">Compliance Command Center</p>
            </div>
          </div>

          <nav className="flex items-center space-x-8">
            <button
              onClick={() => onSectionChange('dashboard')}
              className={`flex items-center space-x-2 text-base font-semibold transition-colors hover:text-red-600 ${
                activeSection === 'dashboard' 
                  ? 'text-red-600 border-b-2 border-red-600 pb-4' 
                  : 'text-gray-700'
              }`}
            >
              <BarChart className="h-4 w-4" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => onSectionChange('knowledge-base')}
              className={`flex items-center space-x-2 text-base font-semibold transition-colors hover:text-red-600 ${
                activeSection === 'knowledge-base' 
                  ? 'text-red-600 border-b-2 border-red-600 pb-4' 
                  : 'text-gray-700'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>Knowledge Base</span>
            </button>
            <button
              onClick={() => onSectionChange('reports')}
              className={`flex items-center space-x-2 text-base font-semibold transition-colors hover:text-red-600 ${
                activeSection === 'reports' 
                  ? 'text-red-600 border-b-2 border-red-600 pb-4' 
                  : 'text-gray-700'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Reports</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}