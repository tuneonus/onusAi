import { Alert } from '../components/ui/Alert';
import { Badge, type BadgeTone } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Icon } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../features/auth/useAuth';
import type { ProbeState, SystemStatusState } from '../hooks/useSystemStatus';
import './DiagnosticsPage.css';

interface DiagnosticsPageProps {
  system: SystemStatusState;
  onRefreshStatus: () => void;
}

function getProbeBadgeTone(status: ProbeState<unknown>['status']): BadgeTone {
  if (status === 'ok') {
    return 'success';
  }
  if (status === 'error') {
    return 'danger';
  }
  return 'info';
}

function getProbeLabel(status: ProbeState<unknown>['status'], okText: string): string {
  if (status === 'ok') {
    return okText;
  }
  if (status === 'error') {
    return 'Unavailable';
  }
  return 'Checking';
}

export function DiagnosticsPage({ system, onRefreshStatus }: DiagnosticsPageProps) {
  const { user, memberships, session } = useAuth();

  const isChecking =
    system.api.status === 'loading' ||
    system.database.status === 'loading' ||
    system.ai.status === 'loading';

  const hasConnectivityFailure =
    system.api.status === 'error' ||
    system.database.status === 'error' ||
    system.ai.status === 'error';

  return (
    <div className="diagnostics-page">
      <Alert tone="info" title="Development Diagnostics">
        Live service health probes, session diagnostics, and centralized branding checks for local
        troubleshooting.
      </Alert>

      <Card accent>
        <CardHeader
          title="Live Backend Connectivity"
          subtitle="Real-time probes against the Node.js business API, PostgreSQL readiness, and FastAPI AI health routes."
          actions={
            <Button
              variant="secondary"
              size="sm"
              loading={isChecking}
              onClick={onRefreshStatus}
            >
              {!isChecking && <Icon name="refresh" size={14} />}
              <span>Refresh checks</span>
            </Button>
          }
        />
        <CardBody>
          {hasConnectivityFailure && (
            <Alert tone="warning" title="One or more backend health checks did not succeed">
              Ensure the Node.js backend (`backend/`) and FastAPI AI service (`ai-backend/`) are
              running locally if you want live status checks to pass.
            </Alert>
          )}

          <div
            className="diagnostics-page__grid"
            style={{ marginTop: hasConnectivityFailure ? 'var(--space-4)' : 0 }}
          >
            <div className="diagnostics-page__stat">
              <div className="diagnostics-page__stat-header">
                <span className="diagnostics-page__stat-label">Business API (`/api/v1/health`)</span>
                <Badge tone={getProbeBadgeTone(system.api.status)}>
                  {system.api.status === 'loading' && <Spinner size="sm" />}
                  {getProbeLabel(system.api.status, 'Healthy')}
                </Badge>
              </div>
              <p className="diagnostics-page__stat-detail">
                {system.api.status === 'ok' && system.api.data
                  ? `${system.api.data.service} · ${new Date(system.api.data.timestamp).toLocaleTimeString()}`
                  : system.api.errorMessage ?? 'Checking API liveness...'}
              </p>
            </div>

            <div className="diagnostics-page__stat">
              <div className="diagnostics-page__stat-header">
                <span className="diagnostics-page__stat-label">
                  PostgreSQL (`/api/v1/health/ready`)
                </span>
                <Badge tone={getProbeBadgeTone(system.database.status)}>
                  {system.database.status === 'loading' && <Spinner size="sm" />}
                  {getProbeLabel(system.database.status, 'Ready')}
                </Badge>
              </div>
              <p className="diagnostics-page__stat-detail">
                {system.database.status === 'ok' && system.database.data
                  ? `Database status: ${system.database.data.database}`
                  : system.database.errorMessage ?? 'Checking database readiness...'}
              </p>
            </div>

            <div className="diagnostics-page__stat">
              <div className="diagnostics-page__stat-header">
                <span className="diagnostics-page__stat-label">AI Service (`/api/v1/ai/health`)</span>
                <Badge tone={getProbeBadgeTone(system.ai.status)}>
                  {system.ai.status === 'loading' && <Spinner size="sm" />}
                  {getProbeLabel(system.ai.status, 'Authenticated')}
                </Badge>
              </div>
              <p className="diagnostics-page__stat-detail">
                {system.ai.status === 'ok' && system.ai.data
                  ? `Internal AI bridge status: ${system.ai.data.status}`
                  : system.ai.errorMessage ?? 'Checking Node-to-FastAPI bridge...'}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Authenticated Staff Session"
          subtitle="Verified session context returned by GET /api/v1/auth/me."
          actions={
            <Badge tone={session?.csrfToken ? 'success' : 'warning'}>
              {session?.csrfToken ? 'CSRF active' : 'CSRF cookie pending'}
            </Badge>
          }
        />
        <CardBody>
          <div className="diagnostics-page__meta-list">
            <div className="diagnostics-page__meta-item">
              <span className="diagnostics-page__meta-key">Signed-in User</span>
              <span className="diagnostics-page__meta-value">
                {user ? `${user.displayName} (${user.email})` : 'Unavailable'}
              </span>
            </div>
            <div className="diagnostics-page__meta-item">
              <span className="diagnostics-page__meta-key">Session Expires</span>
              <span className="diagnostics-page__meta-value">
                {session ? new Date(session.expiresAt).toLocaleString() : 'Unavailable'}
              </span>
            </div>
            <div className="diagnostics-page__meta-item">
              <span className="diagnostics-page__meta-key">Verified Memberships</span>
              <span className="diagnostics-page__meta-value">
                {memberships.length > 0
                  ? memberships
                      .map((entry) => `${entry.businessName} (${entry.role})`)
                      .join(', ')
                  : 'No business memberships yet'}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Centralized Branding"
          subtitle="Loaded from packages/branding/branding.json and synchronized with GET /api/v1/branding."
          actions={
            <Badge tone={system.brandingSynced ? 'success' : 'neutral'}>
              {system.brandingSynced ? 'Synced with API' : 'Local bundle config'}
            </Badge>
          }
        />
        <CardBody>
          <div className="diagnostics-page__meta-list">
            <div className="diagnostics-page__meta-item">
              <span className="diagnostics-page__meta-key">Product Name</span>
              <span className="diagnostics-page__meta-value">{system.branding.productName}</span>
            </div>
            <div className="diagnostics-page__meta-item">
              <span className="diagnostics-page__meta-key">Tagline</span>
              <span className="diagnostics-page__meta-value">{system.branding.tagline}</span>
            </div>
            <div className="diagnostics-page__meta-item">
              <span className="diagnostics-page__meta-key">Attribution</span>
              <span className="diagnostics-page__meta-value">{system.branding.attributionText}</span>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
