import { FileSearch, Shield } from 'lucide-react';

export function Header() {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="relative">
              {/* Logo inspired by GoAlign's soft aesthetic */}
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-[#7C83BC] to-[#9BA1D2]">
                <FileSearch className="h-6 w-6 text-white" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 p-1 rounded-md bg-gradient-to-br from-[#5C63A0] to-[#7C83BC]">
                <Shield className="h-3 w-3 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline space-x-1">
                <h1 className="text-xl font-semibold text-gray-900">CodeAlign</h1>
                <span className="text-xs text-[#7C83BC] font-medium">by GoAlign</span>
              </div>
              <p className="text-sm text-gray-600">Building Code Compliance System</p>
            </div>
          </div>
          <div className="flex items-center">
            <span className="px-3 py-1 text-xs font-medium text-[#7C83BC] bg-[#7C83BC]/10 rounded-full">
              RAG Powered
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}