import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Icon } from '../../../components/ui/Icons';
import { ROLE_PERMISSIONS } from '../permissions';
import { RoleBadge } from './RoleBadge';
import './StaffDirectory.css';

function Permission({ allowed }: { allowed: boolean }) {
  return (
    <span className={`staff-permission staff-permission--${allowed ? 'allowed' : 'restricted'}`}>
      <Icon name={allowed ? 'check' : 'close'} size={15} />
      {allowed ? 'Allowed' : 'Restricted'}
    </span>
  );
}

export function RolePermissions() {
  return (
    <Card>
      <CardHeader
        title="Role permissions"
        subtitle="Access applies within each business. A person may have a different role in another workspace."
      />
      <div className="staff-table-scroll" role="region" aria-label="Role permissions table" tabIndex={0}>
        <table className="staff-table staff-table--permissions">
          <caption className="sr-only">Current backend permissions for owners and operators</caption>
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col"><RoleBadge role="owner" /></th>
              <th scope="col"><RoleBadge role="operator" /></th>
            </tr>
          </thead>
          <tbody>
            {ROLE_PERMISSIONS.map((permission) => (
              <tr key={permission.label}>
                <th scope="row">{permission.label}</th>
                <td><Permission allowed={permission.owner} /></td>
                <td><Permission allowed={permission.operator} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CardBody className="staff-page__footnote">
        <Icon name="shield" size={17} />
        <p>
          Permissions are enforced by the business API. Assistant configuration is available in AI Assistants. Conversation capabilities
          listed here describe existing API access; the conversation dashboard is available in Playground & Inbox.
        </p>
      </CardBody>
    </Card>
  );
}
