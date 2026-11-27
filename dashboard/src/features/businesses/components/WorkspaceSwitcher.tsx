import { Link } from 'react-router-dom';
import { Badge } from '../../../components/ui/Badge';
import { SelectField } from '../../../components/ui/SelectField';
import { ROUTES } from '../../../config/routes';
import { useTenant } from '../useTenant';
import './WorkspaceSwitcher.css';

interface WorkspaceSwitcherProps {
  onNavigate?: () => void;
}

export function WorkspaceSwitcher({ onNavigate }: WorkspaceSwitcherProps) {
  const {
    businesses,
    activeBusinessId,
    activeMembership,
    isLoadingBusinesses,
    selectBusiness,
  } = useTenant();

  return (
    <div className="workspace-switcher">
      <div className="workspace-switcher__header">
        <span className="workspace-switcher__label">Active Business</span>
        {activeMembership && (
          <Badge tone={activeMembership.role === 'owner' ? 'info' : 'neutral'}>
            {activeMembership.role}
          </Badge>
        )}
      </div>

      {businesses.length > 0 ? (
        <SelectField
          id="workspace-switcher-select"
          label="Active business"
          hideLabel
          compact
          disabled={isLoadingBusinesses && businesses.length === 0}
          value={activeBusinessId ?? ''}
          onChange={(event) => selectBusiness(event.target.value)}
        >
          {businesses.map((entry) => (
            <option key={entry.businessId} value={entry.businessId}>
              {entry.businessName}
            </option>
          ))}
        </SelectField>
      ) : (
        <p className="workspace-switcher__empty">
          {isLoadingBusinesses ? 'Loading workspaces...' : 'No businesses yet.'}
        </p>
      )}

      <Link
        to={`${ROUTES.businesses}?mode=create`}
        className="workspace-switcher__new-link"
        onClick={onNavigate}
      >
        + Create new business
      </Link>
    </div>
  );
}

