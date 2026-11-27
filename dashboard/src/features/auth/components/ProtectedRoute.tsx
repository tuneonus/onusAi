import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Spinner } from '../../../components/ui/Spinner';
import { ROUTES } from '../../../config/routes';
import { useAuth } from '../useAuth';

export function ProtectedRoute() {
  const { status, restoreError, restoreSession } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 'var(--space-6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <Spinner size="md" label="Checking staff session" />
          <span>Restoring your session...</span>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    if (restoreError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: 'var(--space-6)',
          }}
        >
          <div style={{ width: '100%', maxWidth: '440px', display: 'grid', gap: 'var(--space-4)' }}>
            <Alert tone="danger" title="Unable to verify session">
              {restoreError}
            </Alert>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Button onClick={() => void restoreSession()}>Retry</Button>
              <Navigate to={ROUTES.login} state={{ from: location }} replace />
            </div>
          </div>
        </div>
      );
    }

    return <Navigate to={ROUTES.login} state={{ from: location }} replace />;
  }

  return <Outlet />;
}

