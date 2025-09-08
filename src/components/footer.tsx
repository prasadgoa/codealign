import { getColorConfig } from '@/config/colors';

export function Footer() {
  const colors = getColorConfig();
  
  return (
    <footer className="mt-auto" style={{ backgroundColor: colors.footer.background, borderTop: `1px solid ${colors.footer.border}` }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="text-center">
          <span className="text-sm" style={{ color: colors.footer.text }}>
            Powered By{' '}
            <span className="font-medium" style={{ color: colors.footer.companyHighlight }}>GoAlign AI</span>
          </span>
        </div>
      </div>
    </footer>
  );
}