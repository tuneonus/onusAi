import type { ReactNode } from 'react';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Icon } from '../components/ui/Icons';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import type { ThemePreference } from '../hooks/useTheme';
import type { PublicBranding } from '../types/api';
import './AuthLayout.css';

interface AuthLayoutProps {
  branding: PublicBranding;
  themePreference: ThemePreference;
  onSelectTheme: (next: ThemePreference) => void;
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthLayout({
  branding,
  themePreference,
  onSelectTheme,
  title,
  subtitle,
  children,
}: AuthLayoutProps) {
  const brandInitials = branding.shortName.slice(0, 2).toUpperCase();

  return (
    <div className="auth-layout">
      <header className="auth-layout__header">
        <div className="auth-layout__brand">
          <span className="auth-layout__brand-mark" aria-hidden="true">
            {brandInitials}
          </span>
          <div className="auth-layout__brand-text">
            <span className="auth-layout__brand-name">{branding.productName}</span>
            <span className="auth-layout__brand-tagline">{branding.tagline}</span>
          </div>
        </div>
        <ThemeToggle preference={themePreference} onSelectPreference={onSelectTheme} />
      </header>

      <main className="auth-layout__main">
        <div className="auth-layout__container">
          <div className="auth-layout__hero">
            <span className="auth-layout__pill">
              <Icon name="sparkles" size={13} />
              <span>{branding.productName} Workspace</span>
            </span>
            <h1 className="auth-layout__headline">{title}</h1>
            <p className="auth-layout__subhead">{subtitle}</p>
          </div>

          <Card accent className="auth-layout__card">
            <CardHeader
              title="Staff credentials"
              subtitle="Use your assigned business email and password."
            />
            <CardBody>{children}</CardBody>
          </Card>
        </div>
      </main>

      <footer className="auth-layout__footer">
        {branding.tagline} · {branding.attributionText}
      </footer>
    </div>
  );
}
