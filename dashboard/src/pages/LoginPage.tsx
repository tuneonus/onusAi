import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/Spinner';
import { ROUTES } from '../config/routes';
import { LoginForm } from '../features/auth/components/LoginForm';
import { useAuth } from '../features/auth/useAuth';
import type { ThemePreference } from '../hooks/useTheme';
import { AuthLayout } from '../layouts/AuthLayout';
import type { PublicBranding } from '../types/api';

interface LoginPageProps {
  branding: PublicBranding;
  themePreference: ThemePreference;
  onSelectTheme: (next: ThemePreference) => void;
}

interface RedirectLocationState {
  from?: {
    pathname?: string;
    search?: string;
  };
}

function resolvePostLoginPath(state: unknown): string {
  if (typeof state !== 'object' || state === null) {
    return ROUTES.overview;
  }

  const from = (state as RedirectLocationState).from;

  if (!from?.pathname || from.pathname === ROUTES.login) {
    return ROUTES.overview;
  }

  return `${from.pathname}${from.search ?? ''}`;
}

export function LoginPage({
  branding,
  themePreference,
  onSelectTheme,
}: LoginPageProps) {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const destination = resolvePostLoginPath(location.state);

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}
      >
        <Spinner size="md" label="Checking session" />
      </div>
    );
  }

  if (status === 'authenticated') {
    return <Navigate to={destination} replace />;
  }

  return (
    <AuthLayout
      branding={branding}
      themePreference={themePreference}
      onSelectTheme={onSelectTheme}
      title="Welcome back"
      subtitle={`Sign in to manage your ${branding.productName} business workspace.`}
    >
      <LoginForm onSuccess={() => navigate(destination, { replace: true })} />
    </AuthLayout>
  );
}
