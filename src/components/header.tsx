import { Shield, Flame, BarChart, BookOpen, FileText } from 'lucide-react';
import { getBrandingConfig } from '@/config/branding';
import { getColorConfig } from '@/config/colors';

interface HeaderProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export function Header({ activeSection, onSectionChange }: HeaderProps) {
  const branding = getBrandingConfig();
  const colors = getColorConfig();
  
  return (
    <header className="shadow-sm" style={{ backgroundColor: colors.navigation.background, borderBottom: `1px solid ${colors.navigation.border}` }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="relative">
              {/* Fire Department Logo */}
              <div 
                className="p-2.5 rounded-lg shadow-medium" 
                style={{ background: `linear-gradient(to bottom right, ${colors.logo.primary}, ${colors.logo.primaryEnd})` }}
              >
                <Flame className="h-6 w-6" style={{ color: colors.logo.icon }} />
              </div>
              <div 
                className="absolute -bottom-0.5 -right-0.5 p-1 rounded-md shadow-soft" 
                style={{ background: `linear-gradient(to bottom right, ${colors.logo.secondary}, ${colors.logo.secondaryEnd})` }}
              >
                <Shield className="h-3 w-3" style={{ color: colors.logo.icon }} />
              </div>
            </div>
            <div>
              <div className="flex items-baseline space-x-1">
                <h1 className="text-xl font-semibold" style={{ color: colors.navigation.titleText }}>{branding.appName}</h1>
                <span className="text-xs font-medium" style={{ color: colors.navigation.companyText }}>by {branding.companyName}</span>
              </div>
              <p className="text-sm" style={{ color: colors.navigation.taglineText }}>{branding.tagline}</p>
            </div>
          </div>

          <nav className="flex items-center space-x-8">
            <button
              onClick={() => onSectionChange('dashboard')}
              className={`flex items-center space-x-2 text-base font-semibold transition-colors pb-4 ${
                activeSection === 'dashboard' ? 'border-b-2' : ''
              }`}
              style={{ 
                color: activeSection === 'dashboard' ? colors.navigation.linkActive : colors.navigation.linkInactive,
                borderBottomColor: activeSection === 'dashboard' ? colors.navigation.activeBorder : 'transparent'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = colors.navigation.linkActive}
              onMouseLeave={(e) => e.currentTarget.style.color = activeSection === 'dashboard' ? colors.navigation.linkActive : colors.navigation.linkInactive}
            >
              <BarChart className="h-4 w-4" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => onSectionChange('knowledge-base')}
              className={`flex items-center space-x-2 text-base font-semibold transition-colors pb-4 ${
                activeSection === 'knowledge-base' ? 'border-b-2' : ''
              }`}
              style={{ 
                color: activeSection === 'knowledge-base' ? colors.navigation.linkActive : colors.navigation.linkInactive,
                borderBottomColor: activeSection === 'knowledge-base' ? colors.navigation.activeBorder : 'transparent'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = colors.navigation.linkActive}
              onMouseLeave={(e) => e.currentTarget.style.color = activeSection === 'knowledge-base' ? colors.navigation.linkActive : colors.navigation.linkInactive}
            >
              <BookOpen className="h-4 w-4" />
              <span>{branding.knowledgeBaseName}</span>
            </button>
            <button
              onClick={() => onSectionChange('reports')}
              className={`flex items-center space-x-2 text-base font-semibold transition-colors pb-4 ${
                activeSection === 'reports' ? 'border-b-2' : ''
              }`}
              style={{ 
                color: activeSection === 'reports' ? colors.navigation.linkActive : colors.navigation.linkInactive,
                borderBottomColor: activeSection === 'reports' ? colors.navigation.activeBorder : 'transparent'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = colors.navigation.linkActive}
              onMouseLeave={(e) => e.currentTarget.style.color = activeSection === 'reports' ? colors.navigation.linkActive : colors.navigation.linkInactive}
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