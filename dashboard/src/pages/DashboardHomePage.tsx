import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Icon } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { getVisibleNavItems, ROUTES } from '../config/routes';
import { useTenant } from '../features/businesses/useTenant';
import './DashboardHomePage.css';

export function DashboardHomePage() {
  const navigate = useNavigate();
  const {
    businesses,
    activeMembership,
    activeBusiness,
    isLoadingBusinesses,
    isLoadingProfile,
    businessesError,
    profileError,
  } = useTenant();

  const workspaceModules = getVisibleNavItems(activeMembership?.role).filter(
    (item) => item.section === 'workspace' && item.path !== ROUTES.overview,
  );

  return (
    <div className="dashboard-home">
      {businessesError && (
        <Alert tone="danger" title="Unable to load workspaces">
          {businessesError}
        </Alert>
      )}

      {profileError && (
        <Alert tone="danger" title="Unable to load active business profile">
          {profileError}
        </Alert>
      )}

      {isLoadingBusinesses && businesses.length === 0 ? (
        <Card>
          <CardBody>
            <div className="dashboard-home__loading">
              <Spinner size="md" label="Loading workspaces" />
              <span>Loading your business workspaces...</span>
            </div>
          </CardBody>
        </Card>
      ) : !activeMembership ? (
        <Card accent>
          <CardHeader
            title="Create your first business workspace"
            subtitle="You are signed in, and you can initialize a business workspace in seconds."
            actions={
              <Button onClick={() => navigate(`${ROUTES.businesses}?mode=create`)}>
                <span>Create business</span>
                <Icon name="arrowRight" size={15} />
              </Button>
            }
          />
          <CardBody>
            <p className="dashboard-home__value">
              Configure your business profile, operating hours, locations, and AI assistants in
              one isolated tenant workspace.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card accent>
          <CardHeader
            title={activeBusiness?.name ?? activeMembership.businessName}
            subtitle={
              activeBusiness?.description ??
              'Active business workspace configuration and verified details.'
            }
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Badge tone={activeMembership.role === 'owner' ? 'info' : 'neutral'}>
                  {activeMembership.role === 'owner' ? 'Owner' : 'Operator'}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(ROUTES.businesses)}
                >
                  {activeMembership.role === 'owner' ? 'Manage profile' : 'View profile'}
                </Button>
              </div>
            }
          />
          <CardBody>
            {isLoadingProfile && !activeBusiness ? (
              <div className="dashboard-home__loading">
                <Spinner size="sm" label="Loading business profile" />
                <span>Loading business details...</span>
              </div>
            ) : activeBusiness ? (
              <div className="dashboard-home__meta">
                <div className="dashboard-home__field">
                  <span className="dashboard-home__label">Timezone</span>
                  <span className="dashboard-home__value">
                    {activeBusiness.timezone ?? 'Not configured'}
                  </span>
                </div>
                <div className="dashboard-home__field">
                  <span className="dashboard-home__label">Contact Email</span>
                  <span className="dashboard-home__value">
                    {activeBusiness.contactEmail ?? 'Not configured'}
                  </span>
                </div>
                <div className="dashboard-home__field">
                  <span className="dashboard-home__label">Contact Phone</span>
                  <span className="dashboard-home__value">
                    {activeBusiness.contactPhone ?? 'Not configured'}
                  </span>
                </div>
                <div className="dashboard-home__field">
                  <span className="dashboard-home__label">Website</span>
                  <span className="dashboard-home__value">
                    {activeBusiness.websiteUrl ?? 'Not configured'}
                  </span>
                </div>
                <div className="dashboard-home__field">
                  <span className="dashboard-home__label">Retention Policy</span>
                  <span className="dashboard-home__value">
                    {activeBusiness.retentionDays !== null
                      ? `${activeBusiness.retentionDays} days`
                      : 'Server default'}
                  </span>
                </div>
                <div className="dashboard-home__field">
                  <span className="dashboard-home__label">Weekly Hours</span>
                  <span className="dashboard-home__value">
                    {activeBusiness.openingHours ? '7-day schedule active' : 'Not configured'}
                  </span>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Workspace Capabilities"
          subtitle="Manage your business profile, locations, team access, AI assistants, and conversations."
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(ROUTES.diagnostics)}
            >
              <Icon name="activity" size={14} />
              <span>System Diagnostics</span>
            </Button>
          }
        />
        <CardBody>
          <div className="dashboard-home__modules">
            {workspaceModules.map((item) => (
              <Link key={item.path} to={item.path} className="dashboard-home__module-card">
                <div className="dashboard-home__module-top">
                  <div className="dashboard-home__module-heading">
                    <span className="dashboard-home__module-icon" aria-hidden="true">
                      <Icon name={item.icon} size={16} />
                    </span>
                    <span className="dashboard-home__module-title">{item.label}</span>
                  </div>
                  <Badge tone={item.implemented ? 'success' : 'neutral'}>
                    {item.implemented ? 'Active' : 'Coming soon'}
                  </Badge>
                </div>
                <p className="dashboard-home__module-desc">{item.description}</p>
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
