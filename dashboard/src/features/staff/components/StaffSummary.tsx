import { Card, CardBody } from '../../../components/ui/Card';
import { Icon, type IconName } from '../../../components/ui/Icons';
import { summarizeStaff } from '../summary';
import type { StaffMember } from '../types';

const METRICS: ReadonlyArray<{
  key: 'total' | 'owners' | 'operators'; label: string; detail: string; icon: IconName;
}> = [
  { key: 'total', label: 'Total Members', detail: 'People in this workspace', icon: 'users' },
  { key: 'owners', label: 'Owners', detail: 'Business administration', icon: 'shield' },
  { key: 'operators', label: 'Operators', detail: 'Conversation operations', icon: 'message' },
];

export function StaffSummary({ members }: { members: readonly StaffMember[] | null }) {
  const summary = members ? summarizeStaff(members) : null;
  return (
    <div className="staff-page__summary" role="group" aria-label="Staff summary">
      {METRICS.map((metric) => (
        <Card key={metric.key}>
          <CardBody className="staff-page__metric">
            <div>
              <p className="staff-page__metric-label">{metric.label}</p>
              <p className="staff-page__metric-value">{summary ? summary[metric.key] : '—'}</p>
              <p className="staff-page__metric-detail">{metric.detail}</p>
            </div>
            <span className={`staff-page__metric-icon staff-page__metric-icon--${metric.key}`}>
              <Icon name={metric.icon} size={21} />
            </span>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
