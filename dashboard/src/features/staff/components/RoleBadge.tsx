import { Badge } from '../../../components/ui/Badge';
import { Icon } from '../../../components/ui/Icons';
import type { BusinessRole } from '../../auth/types';

export function RoleBadge({ role }: { role: BusinessRole }) {
  return (
    <Badge tone={role === 'owner' ? 'info' : 'neutral'}>
      <Icon name={role === 'owner' ? 'shield' : 'users'} size={13} />
      {role === 'owner' ? 'Owner' : 'Operator'}
    </Badge>
  );
}
