import { Link } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Icon } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { ROUTES } from '../config/routes';
import type { UserMembershipSummary } from '../features/auth/types';
import { useAuth } from '../features/auth/useAuth';
import { useTenant } from '../features/businesses/useTenant';
import { RolePermissions } from '../features/staff/components/RolePermissions';
import { StaffDirectory } from '../features/staff/components/StaffDirectory';
import { StaffSummary } from '../features/staff/components/StaffSummary';
import { canViewStaff } from '../features/staff/permissions';
import { useStaff } from '../features/staff/useStaff';
import './StaffPage.css';

function AccessDenied() {
  return (
    <Card accent>
      <CardHeader title="Staff directory access denied" subtitle="Only business owners can view staff and workspace access." />
      <CardBody className="staff-page__state">
        <Icon name="shield" size={28} />
        <p>Your current access does not permit viewing this directory. Select a workspace you own or contact its owner.</p>
        <Link to={ROUTES.overview}>Return to overview</Link>
      </CardBody>
    </Card>
  );
}

function OwnerStaffWorkspace({ membership, userId }: { membership: UserMembershipSummary; userId: string }) {
  const { state, retry } = useStaff(membership);
  if (state.kind === 'forbidden') return <AccessDenied />;
  if (state.kind === 'unauthenticated') {
    return <Alert tone="warning" title="Session expired">Please sign in again to view staff.</Alert>;
  }

  const members = state.kind === 'loaded' ? state.members : null;
  return (
    <div className="staff-page">
      <Card accent>
        <CardBody className="staff-page__hero">
          <span className="staff-page__hero-icon" aria-hidden="true"><Icon name="users" size={25} /></span>
          <div className="staff-page__hero-copy">
            <p className="staff-page__eyebrow">People & permissions</p>
            <h2 className="staff-page__title">Your team. Clear access.</h2>
            <p className="staff-page__description">
              View the people in {membership.businessName} and understand what each workspace role can do.
            </p>
          </div>
          <Badge tone="info"><Icon name="shield" size={13} />Owner access</Badge>
        </CardBody>
      </Card>

      <StaffSummary members={members} />

      <Card aria-busy={state.kind === 'loading'}>
        <CardHeader
          title="Team directory"
          subtitle={`Business staff for ${membership.businessName}.`}
          actions={
            <Button variant="secondary" size="sm" onClick={retry} disabled={state.kind === 'loading'}>
              <Icon name="refresh" size={14} />Refresh
            </Button>
          }
        />
        {state.kind === 'loading' ? (
          <CardBody className="staff-page__state">
            <Spinner label="Loading staff directory" />
            <p>Loading workspace members…</p>
          </CardBody>
        ) : state.kind === 'error' ? (
          <CardBody>
            <Alert tone="danger" title="Unable to load staff">
              <div className="staff-page__error">
                <p>{state.message}</p>
                <Button variant="secondary" size="sm" onClick={retry}>Retry</Button>
              </div>
            </Alert>
          </CardBody>
        ) : members && members.length === 0 ? (
          <CardBody className="staff-page__state">
            <Icon name="users" size={28} />
            <h3>No staff members found</h3>
            <p>No memberships were returned for this business. Refresh to check again.</p>
          </CardBody>
        ) : members ? (
          <StaffDirectory members={members} businessName={membership.businessName} currentUserId={userId} />
        ) : null}
        <CardBody className="staff-page__footnote">
          <Icon name="eye" size={17} />
          <p>This directory is read-only. Invitations, member removal, and role changes are not available yet.</p>
        </CardBody>
      </Card>

      <RolePermissions />
    </div>
  );
}

export function StaffPage() {
  const { status, user } = useAuth();
  const { activeBusinessId, activeMembership, isLoadingBusinesses } = useTenant();

  if (status === 'loading' || (isLoadingBusinesses && !activeMembership)) {
    return <Card><CardBody className="staff-page__state"><Spinner label="Loading workspace" /></CardBody></Card>;
  }
  if (status !== 'authenticated' || !user) return <AccessDenied />;
  if (!activeBusinessId || !activeMembership) {
    return (
      <Card accent>
        <CardHeader title="Select a business workspace" subtitle="Choose a business from the workspace switcher to view its staff directory." />
        <CardBody><Link to={ROUTES.businesses}>View business workspaces</Link></CardBody>
      </Card>
    );
  }
  if (activeMembership.businessId !== activeBusinessId || !canViewStaff(activeMembership.role)) {
    return <AccessDenied />;
  }

  return (
    <OwnerStaffWorkspace
      key={`${user.id}:${activeBusinessId}:${activeMembership.membershipId}:${activeMembership.role}`}
      membership={activeMembership}
      userId={user.id}
    />
  );
}
