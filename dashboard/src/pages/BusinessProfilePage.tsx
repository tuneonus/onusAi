import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { ROUTES } from '../config/routes';
import { createBusiness, updateBusinessProfile } from '../features/businesses/api';
import { BusinessProfileForm } from '../features/businesses/components/BusinessProfileForm';
import type {
  CreateBusinessPayload,
  UpdateBusinessPayload,
} from '../features/businesses/types';
import { useTenant } from '../features/businesses/useTenant';
import './BusinessProfilePage.css';

export function BusinessProfilePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isCreateMode = searchParams.get('mode') === 'create';

  const {
    activeBusinessId,
    activeMembership,
    activeBusiness,
    isLoadingProfile,
    profileError,
    refreshActiveProfile,
    registerCreatedBusiness,
    applyUpdatedBusiness,
  } = useTenant();

  const handleCreate = async (payload: CreateBusinessPayload) => {
    const response = await createBusiness(payload);
    registerCreatedBusiness(response.business, {
      membershipId: response.membership.id,
      businessId: response.business.id,
      businessName: response.business.name,
      role: response.membership.role,
    });
    navigate(ROUTES.businesses, { replace: true });
  };

  const handleUpdate = async (payload: UpdateBusinessPayload) => {
    if (!activeBusinessId) {
      return;
    }

    const response = await updateBusinessProfile(activeBusinessId, payload);
    applyUpdatedBusiness(response.business);
  };

  if (isCreateMode || !activeBusinessId) {
    return (
      <div className="business-page">
        <Card>
          <CardHeader
            title="Create Business"
            subtitle="Create a new tenant workspace. You will be assigned the owner role."
            actions={
              activeBusinessId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(ROUTES.businesses)}
                >
                  Back to active profile
                </Button>
              ) : undefined
            }
          />
          <CardBody>
            <BusinessProfileForm
              mode="create"
              onCreateSubmit={handleCreate}
              onCancel={activeBusinessId ? () => navigate(ROUTES.businesses) : undefined}
            />
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="business-page">
      <Card>
        <CardHeader
          title={activeBusiness?.name ?? activeMembership?.businessName ?? 'Business Profile'}
          subtitle="Manage tenant contact details, IANA timezone, weekly opening hours, and conversation retention policy."
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {activeMembership && (
                <Badge tone={activeMembership.role === 'owner' ? 'info' : 'neutral'}>
                  {activeMembership.role}
                </Badge>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`${ROUTES.businesses}?mode=create`)}
              >
                New business
              </Button>
            </div>
          }
        />
        <CardBody>
          {profileError && (
            <div style={{ display: 'grid', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <Alert tone="danger" title="Unable to load business profile">
                {profileError}
              </Alert>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void refreshActiveProfile()}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {isLoadingProfile && !activeBusiness ? (
            <div className="business-page__loading">
              <Spinner size="md" label="Loading business profile" />
              <span>Loading business profile...</span>
            </div>
          ) : activeBusiness ? (
            <BusinessProfileForm
              key={`${activeBusiness.id}-${activeBusiness.updatedAt}`}
              mode="edit"
              initialBusiness={activeBusiness}
              readOnly={activeMembership?.role !== 'owner'}
              onUpdateSubmit={handleUpdate}
            />
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

