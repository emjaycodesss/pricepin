/**
 * Admin shell: logo, navbar (Overview, Flag/Report Manager, Menu Version History).
 * Responsive: compact header on mobile, touch-friendly nav, safe area aware.
 */
import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

interface AdminLayoutProps {
  children: ReactNode;
  /** Optional title for sub-pages (e.g. "Verify: Spot Name"). Rendered next to back icon. */
  title?: string;
  /** If true, show icon-only back button (to Overview) like Add Food Spot form. */
  showBack?: boolean;
  /**
   * When true, the root is `h-screen overflow-hidden` so child pages get a fixed
   * viewport height and can use internal-only scroll (like UpdateMenu / AdminVerify).
   * Default: false — root is `min-h-screen`, page scrolls naturally (Dashboard, Flags, History).
   */
  fixedHeight?: boolean;
}

const navItems = [
  { to: '/admin-price-pin', label: 'Overview', shortLabel: 'Overview' },
  { to: '/admin-price-pin/flags', label: 'Flag / Report Manager', shortLabel: 'Flags' },
  { to: '/admin-price-pin/history', label: 'Menu Version History', shortLabel: 'History' },
] as const;

export function AdminLayout({ children, title, showBack, fixedHeight = false }: AdminLayoutProps) {
  const location = useLocation();

  return (
    <div
      className={
        fixedHeight
          ? 'h-full min-h-screen flex flex-col overflow-y-auto tablet:h-screen tablet:h-[100dvh] tablet:overflow-hidden tablet:min-h-0'
          : 'min-h-screen min-h-[100dvh] flex flex-col'
      }
      style={{
        backgroundColor: '#f9fafb',
        backgroundImage: `
          radial-gradient(ellipse 70% 50% at 100% 0%, rgba(234, 0, 11, 0.04) 0%, transparent 60%)
        `,
      }}
    >
      <header className="shrink-0 border-b border-gray-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 tablet:gap-4 px-3 tablet:px-6 py-2.5 tablet:py-3 min-h-[44px] tablet:min-h-0">
          {showBack && (
            <Link
              to="/admin-price-pin"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EA000B] touch-manipulation"
              aria-label="Back to overview"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
          )}
          <Link to="/admin-price-pin" className="flex items-center gap-2 shrink-0 no-underline text-gray-900 min-h-[44px] items-center touch-manipulation">
            <img src="/pricepin_logo.png" alt="" className="h-7 tablet:h-8 w-auto object-contain" />
            <span className="font-semibold text-base tablet:text-lg hidden tablet:inline">PricePin Admin</span>
          </Link>
          <nav className="flex-1 flex items-center justify-end gap-0.5 tablet:gap-1 flex-wrap" aria-label="Admin">
            {navItems.map(({ to, label, shortLabel }) => {
              const isActive = to === '/admin-price-pin' ? location.pathname === to : location.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`rounded-lg min-h-[44px] tablet:min-h-[40px] inline-flex items-center px-2.5 tablet:px-3 py-2 text-xs tablet:text-sm font-medium transition-colors touch-manipulation ${
                    isActive ? 'text-[#EA000B]' : 'text-gray-600 hover:text-gray-900'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="hidden tablet:inline">{label}</span>
                  <span className="tablet:hidden">{shortLabel}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        {title && showBack && (
          <div className="px-3 tablet:px-6 pb-2 pt-0">
            <h1 className="text-base tablet:text-lg font-semibold text-gray-900 truncate">{title}</h1>
          </div>
        )}
      </header>
      {/* Mobile: no flex-1 so content can grow and page scrolls; tablet: flex-1 overflow-hidden for fixed-height internal scroll */}
      <div className="min-h-0 flex flex-col tablet:flex-1 tablet:min-h-0 tablet:overflow-hidden">
        {children}
      </div>
    </div>
  );
}
