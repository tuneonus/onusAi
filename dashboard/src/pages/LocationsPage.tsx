import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Icon } from '../components/ui/Icons';
import { Spinner } from '../components/ui/Spinner';
import { ROUTES } from '../config/routes';
import { useTenant } from '../features/businesses/useTenant';
import {
  archiveBusinessLocation,
  createBusinessLocation,
  listBusinessLocations,
  updateBusinessLocation,
} from '../features/locations/api';
import { LocationCard } from '../features/locations/components/LocationCard';
import { LocationForm } from '../features/locations/components/LocationForm';
import type {
  BusinessLocation,
  CreateLocationPayload,
  LocationFilterMode,
  UpdateLocationPayload,
} from '../features/locations/types';
import { filterLocationsByMode } from '../features/locations/validation';
import { ApiClientError } from '../services/api/client';
import './LocationsPage.css';

const FILTER_OPTIONS: ReadonlyArray<{ value: LocationFilterMode; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

type ActivePanel =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'edit'; location: BusinessLocation };

interface TenantLocationsWorkspaceProps {
  businessId: string;
  businessName: string;
  isOwner: boolean;
  defaultTimezone: string;
}

function TenantLocationsWorkspace({
  businessId,
  businessName,
  isOwner,
  defaultTimezone,
}: TenantLocationsWorkspaceProps) {
  const [filterMode, setFilterMode] = useState<LocationFilterMode>('active');
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const [panel, setPanel] = useState<ActivePanel>({ type: 'none' });
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'info';
    title: string;
    message: string;
  } | null>(null);

  const [archiveTarget, setArchiveTarget] = useState<BusinessLocation | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const includeArchived = filterMode !== 'active';

  useEffect(() => {
    const controller = new AbortController();

    async function fetchLocations() {
      try {
        const response = await listBusinessLocations(
          businessId,
          includeArchived,
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        setLocations(response.locations);
        setLoadError(null);
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return;
        }

        setLoadError(
          error instanceof ApiClientError
            ? error.message
            : 'Unable to load locations for this business.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchLocations();

    return () => {
      controller.abort();
    };
  }, [businessId, includeArchived, refreshIndex]);

  const handleFilterChange = (nextMode: LocationFilterMode) => {
    setFilterMode(nextMode);
    setIsLoading(true);
    setLoadError(null);
  };

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    setRefreshIndex((count) => count + 1);
  }, []);

  const handleCreateLocation = async (payload: CreateLocationPayload) => {
    const response = await createBusinessLocation(businessId, payload);
    setPanel({ type: 'none' });
    setFeedback({
      tone: 'success',
      title: 'Location created',
      message: `${response.location.name} is now active in ${businessName}.`,
    });
    setIsLoading(true);
    setRefreshIndex((count) => count + 1);
  };

  const handleUpdateLocation = async (
    locationId: string,
    payload: UpdateLocationPayload,
  ) => {
    const response = await updateBusinessLocation(businessId, locationId, payload);
    setPanel({ type: 'none' });
    setFeedback({
      tone: 'success',
      title: 'Location updated',
      message: `Saved changes to ${response.location.name}.`,
    });
    setLocations((previous) =>
      previous.map((item) => (item.id === response.location.id ? response.location : item)),
    );
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) {
      return;
    }

    setArchiveError(null);
    setIsArchiving(true);

    try {
      const response = await archiveBusinessLocation(businessId, archiveTarget.id);
      setArchiveTarget(null);
      setPanel((current) =>
        current.type === 'edit' && current.location.id === response.location.id
          ? { type: 'none' }
          : current,
      );
      setFeedback({
        tone: 'success',
        title: 'Location archived',
        message: `${response.location.name} was soft-archived and its name is now freed for reuse.`,
      });
      setLocations((previous) =>
        includeArchived
          ? previous.map((item) => (item.id === response.location.id ? response.location : item))
          : previous.filter((item) => item.id !== response.location.id),
      );
    } catch (error) {
      setArchiveError(
        error instanceof ApiClientError
          ? error.message
          : 'Unable to archive location.',
      );
    } finally {
      setIsArchiving(false);
    }
  };

  const visibleLocations = filterLocationsByMode(locations, filterMode);

  return (
    <div className="locations-page">
      <Card accent>
        <CardHeader
          title="Business Locations"
          subtitle={`Manage physical branches, timezones, and operating hours for ${businessName}.`}
          actions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Badge tone={isOwner ? 'info' : 'neutral'}>
                {isOwner ? 'Owner' : 'Operator (Read-only)'}
              </Badge>
              {isOwner && panel.type !== 'create' && (
                <Button
                  size="sm"
                  onClick={() => {
                    setFeedback(null);
                    setPanel({ type: 'create' });
                  }}
                >
                  <Icon name="plus" size={15} />
                  <span>Add location</span>
                </Button>
              )}
            </div>
          }
        />
        <CardBody>
          <div className="locations-page__toolbar">
            <div className="locations-page__filters" role="group" aria-label="Filter locations">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="locations-page__filter-btn"
                  aria-pressed={filterMode === option.value}
                  onClick={() => handleFilterChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <Button variant="ghost" size="sm" onClick={handleRetry} disabled={isLoading}>
              <Icon name="refresh" size={14} />
              <span>Refresh</span>
            </Button>
          </div>
        </CardBody>
      </Card>

      {!isOwner && (
        <Alert tone="info" title="Read-only operator permissions">
          Your role in {businessName} is operator. You can inspect location details, while owners
          manage creating, editing, and archiving locations.
        </Alert>
      )}

      {feedback && (
        <Alert tone={feedback.tone} title={feedback.title}>
          {feedback.message}
        </Alert>
      )}

      {panel.type === 'create' && isOwner && (
        <Card accent>
          <CardHeader
            title="New Location"
            subtitle={`Add an active location to ${businessName}.`}
          />
          <CardBody>
            <LocationForm
              mode="create"
              defaultTimezone={defaultTimezone}
              onCreateSubmit={handleCreateLocation}
              onCancel={() => setPanel({ type: 'none' })}
            />
          </CardBody>
        </Card>
      )}

      {panel.type === 'edit' && (
        <Card accent>
          <CardHeader
            title={
              isOwner && !panel.location.archivedAt
                ? `Edit ${panel.location.name}`
                : panel.location.name
            }
            subtitle="Update address, contact details, IANA timezone, and weekly operating hours."
          />
          <CardBody>
            <LocationForm
              key={`${panel.location.id}-${panel.location.updatedAt}`}
              mode="edit"
              initialLocation={panel.location}
              defaultTimezone={defaultTimezone}
              readOnly={!isOwner}
              onUpdateSubmit={(payload) => handleUpdateLocation(panel.location.id, payload)}
              onCancel={() => setPanel({ type: 'none' })}
            />
          </CardBody>
        </Card>
      )}

      {loadError && (
        <Alert tone="danger" title="Unable to load locations">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <span>{loadError}</span>
            <div>
              <Button variant="secondary" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {isLoading ? (
        <Card>
          <CardBody>
            <div className="locations-page__loading">
              <Spinner size="md" label="Loading locations" />
              <span>Loading locations...</span>
            </div>
          </CardBody>
        </Card>
      ) : visibleLocations.length === 0 ? (
        <Card>
          <CardBody>
            <div className="locations-page__empty">
              <p className="locations-page__empty-text">
                {filterMode === 'archived'
                  ? 'No archived locations found for this business.'
                  : filterMode === 'all'
                    ? 'No locations have been added to this business yet.'
                    : 'No active locations found for this business.'}
              </p>
              {isOwner && filterMode !== 'archived' && panel.type !== 'create' && (
                <Button size="sm" onClick={() => setPanel({ type: 'create' })}>
                  <Icon name="plus" size={15} />
                  <span>Add first location</span>
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="locations-page__list">
          {visibleLocations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              isOwner={isOwner}
              onEdit={(target) => {
                setFeedback(null);
                setPanel({ type: 'edit', location: target });
              }}
              onArchiveRequest={(target) => {
                setArchiveError(null);
                setArchiveTarget(target);
              }}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title={archiveTarget ? `Archive "${archiveTarget.name}"?` : 'Archive location?'}
        description="Soft-archiving removes this location from active lists and frees its name for reuse while preserving historical assistant and conversation links. Archived locations cannot be edited."
        confirmLabel={isArchiving ? 'Archiving...' : 'Archive location'}
        confirmVariant="danger"
        loading={isArchiving}
        errorMessage={archiveError}
        onCancel={() => {
          setArchiveTarget(null);
          setArchiveError(null);
        }}
        onConfirm={() => void handleConfirmArchive()}
      />
    </div>
  );
}

export function LocationsPage() {
  const navigate = useNavigate();
  const {
    activeBusinessId,
    activeMembership,
    activeBusiness,
    isLoadingBusinesses,
  } = useTenant();

  if (isLoadingBusinesses && !activeMembership) {
    return (
      <Card>
        <CardBody>
          <div className="locations-page__loading">
            <Spinner size="md" label="Loading workspace" />
            <span>Loading active business workspace...</span>
          </div>
        </CardBody>
      </Card>
    );
  }

  if (!activeBusinessId || !activeMembership) {
    return (
      <Card accent>
        <CardHeader
          title="No active business selected"
          subtitle="Create or select a business workspace before managing locations."
          actions={
            <Button onClick={() => navigate(`${ROUTES.businesses}?mode=create`)}>
              Create business
            </Button>
          }
        />
        <CardBody>
          <p className="locations-page__empty-text">
            Locations are tenant-scoped under a business workspace.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <TenantLocationsWorkspace
      key={activeBusinessId}
      businessId={activeBusinessId}
      businessName={activeMembership.businessName}
      isOwner={activeMembership.role === 'owner'}
      defaultTimezone={activeBusiness?.timezone ?? ''}
    />
  );
}

