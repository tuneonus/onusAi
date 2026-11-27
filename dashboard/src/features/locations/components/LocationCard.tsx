import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icons';
import { DAYS_OF_WEEK } from '../../../types/schedule';
import { cn } from '../../../utils/cn';
import type { BusinessLocation } from '../types';
import { formatLocationAddress } from '../validation';
import './LocationCard.css';

interface LocationCardProps {
  location: BusinessLocation;
  isOwner: boolean;
  onEdit: (location: BusinessLocation) => void;
  onArchiveRequest: (location: BusinessLocation) => void;
}

function summarizeOpeningHours(location: BusinessLocation): string {
  if (!location.openingHours) {
    return 'Not configured';
  }

  const openDays = DAYS_OF_WEEK.filter((day) => !location.openingHours?.[day].closed).length;
  return openDays === 0 ? 'Closed all week' : `Open ${openDays} day${openDays === 1 ? '' : 's'}/week`;
}

export function LocationCard({
  location,
  isOwner,
  onEdit,
  onArchiveRequest,
}: LocationCardProps) {
  const isArchived = location.archivedAt !== null;
  const formattedAddress = formatLocationAddress(location.address);

  return (
    <article className={cn('location-card', isArchived && 'location-card--archived')}>
      <div className="location-card__top">
        <div className="location-card__title-group">
          <span className="location-card__icon" aria-hidden="true">
            <Icon name="mapPin" size={17} />
          </span>
          <div>
            <h3 className="location-card__name">{location.name}</h3>
            <div className="location-card__timezone">
              <Icon name="clock" size={12} />
              <span>{location.timezone ?? 'Timezone not set'}</span>
            </div>
          </div>
        </div>

        <Badge tone={isArchived ? 'neutral' : 'success'}>
          {isArchived ? 'Archived' : 'Active'}
        </Badge>
      </div>

      <div className="location-card__details">
        <div className="location-card__detail-item">
          <span className="location-card__detail-label">Address</span>
          <span className="location-card__detail-value">
            {formattedAddress ?? 'Not configured'}
          </span>
        </div>

        <div className="location-card__detail-item">
          <span className="location-card__detail-label">Contact</span>
          <span className="location-card__detail-value">
            {[location.contactEmail, location.contactPhone].filter(Boolean).join(' · ') ||
              'Not configured'}
          </span>
        </div>

        <div className="location-card__detail-item">
          <span className="location-card__detail-label">Schedule</span>
          <span className="location-card__detail-value">{summarizeOpeningHours(location)}</span>
        </div>
      </div>

      <div className="location-card__actions">
        <span className="location-card__timestamp">
          {isArchived && location.archivedAt
            ? `Archived ${new Date(location.archivedAt).toLocaleDateString()}`
            : `Updated ${new Date(location.updatedAt).toLocaleDateString()}`}
        </span>

        <div className="location-card__buttons">
          <Button variant="secondary" size="sm" onClick={() => onEdit(location)}>
            {isOwner && !isArchived ? (
              <>
                <Icon name="edit" size={14} />
                <span>Edit</span>
              </>
            ) : (
              <span>View details</span>
            )}
          </Button>

          {isOwner && !isArchived && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onArchiveRequest(location)}
            >
              <Icon name="archive" size={14} />
              <span>Archive</span>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

