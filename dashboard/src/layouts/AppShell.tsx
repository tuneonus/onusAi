import { requestGuardedAction } from '../hooks/useUnsavedChanges';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icons';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { getVisibleNavItems, ROUTES } from '../config/routes';
import { useAuth } from '../features/auth/useAuth';
import { WorkspaceSwitcher } from '../features/businesses/components/WorkspaceSwitcher';
import { useTenant } from '../features/businesses/useTenant';
import type { ThemePreference } from '../hooks/useTheme';
import { ApiClientError } from '../services/api/client';
import type { PublicBranding } from '../types/api';
import { cn } from '../utils/cn';
import './AppShell.css';

interface AppShellProps {
  branding: PublicBranding;
  themePreference: ThemePreference;
  onSelectTheme: (next: ThemePreference) => void;
  pageTitle: string;
  children: ReactNode;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'ST';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function AppShell({
  branding,
  themePreference,
  onSelectTheme,
  pageTitle,
  children,
}: AppShellProps) {
  const { user, logout } = useAuth();
  const { activeMembership } = useTenant();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const brandInitials = branding.shortName.slice(0, 2).toUpperCase();

  const visibleNavItems = getVisibleNavItems(activeMembership?.role);
  const workspaceNavItems = visibleNavItems.filter((item) => item.section === 'workspace');
  const systemNavItems = visibleNavItems.filter((item) => item.section === 'system');

  const handleSignOut = async () => {
    setLogoutError(null);
    setIsSigningOut(true);

    try {
      await logout();
      navigate(ROUTES.login, { replace: true });
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : 'Unable to sign out cleanly. Please try again.';
      setLogoutError(message);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="app-shell">
      <a href="#main-content" className="app-shell__skip-link">
        Skip to content
      </a>

      {mobileMenuOpen && (
        <div
          className="app-shell__backdrop"
          aria-hidden="true"
          onClick={closeMobileMenu}
        />
      )}

      <aside
        aria-label="Primary sidebar"
        className={cn(
          'app-shell__sidebar',
          mobileMenuOpen && 'app-shell__sidebar--open',
        )}
      >
        <div className="app-shell__brand">
          <Link
            to={ROUTES.overview}
            className="app-shell__brand-link"
            onClick={closeMobileMenu}
          >
            <span className="app-shell__brand-mark" aria-hidden="true">
              {brandInitials}
            </span>
            <span className="app-shell__brand-text">
              <span className="app-shell__brand-name">{branding.productName}</span>
              <span className="app-shell__brand-tagline">{branding.tagline}</span>
            </span>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            className="app-shell__drawer-close"
            aria-label="Close navigation menu"
            onClick={closeMobileMenu}
          >
            <Icon name="close" size={16} />
          </Button>
        </div>

        <WorkspaceSwitcher onNavigate={closeMobileMenu} />

        <nav aria-label="Dashboard navigation" className="app-shell__nav">
          <span className="app-shell__nav-section">Workspace</span>
          {workspaceNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === ROUTES.overview}
              className="app-shell__nav-link"
              onClick={closeMobileMenu}
            >
              <span className="app-shell__nav-link-main">
                <Icon name={item.icon} size={17} className="app-shell__nav-icon" />
                <span>{item.label}</span>
              </span>
              {!item.implemented && (
                <span className="app-shell__nav-soon">Soon</span>
              )}
            </NavLink>
          ))}

          <span className="app-shell__nav-section" style={{ marginTop: 'var(--space-5)' }}>
            Diagnostics
          </span>
          {systemNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className="app-shell__nav-link"
              onClick={closeMobileMenu}
            >
              <span className="app-shell__nav-link-main">
                <Icon name={item.icon} size={17} className="app-shell__nav-icon" />
                <span>{item.label}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <footer className="app-shell__sidebar-footer">
          {user && (
            <div className="app-shell__user-card">
              <span className="app-shell__user-avatar" aria-hidden="true">
                {getInitials(user.displayName)}
              </span>
              <div className="app-shell__user-meta">
                <div className="app-shell__user-name">{user.displayName}</div>
                <div className="app-shell__user-email" title={user.email}>
                  {user.email}
                </div>
              </div>
            </div>
          )}
          <div className="app-shell__attribution">{branding.attributionText}</div>
        </footer>
      </aside>

      <div className="app-shell__main-column">
        <header className="app-shell__topbar">
          <div className="app-shell__topbar-left">
            <Button
              variant="secondary"
              size="sm"
              className="app-shell__menu-btn"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              <Icon name="menu" size={16} />
            </Button>
            <h1 className="app-shell__page-title">{pageTitle}</h1>
            {activeMembership && (
              <Badge tone="neutral" className="app-shell__workspace-pill">
                {activeMembership.businessName}
              </Badge>
            )}
          </div>

          <div className="app-shell__topbar-right">
            <ThemeToggle preference={themePreference} onSelectPreference={onSelectTheme} />
            <Button
              variant="secondary"
              size="sm"
              loading={isSigningOut}
              aria-label="Sign out"
              onClick={() => requestGuardedAction(() => void handleSignOut())}
            >
              <Icon name="logout" size={14} />
              <span className="app-shell__signout-label">Sign out</span>
            </Button>
          </div>
        </header>

        <main id="main-content" className="app-shell__main" tabIndex={-1}>
          <div className="app-shell__content">
            {logoutError && (
              <Alert tone="danger" title="Sign-out failed">
                {logoutError}
              </Alert>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
