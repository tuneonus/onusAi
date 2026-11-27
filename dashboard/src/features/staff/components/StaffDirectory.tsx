import { getStaffInitials } from '../summary';
import type { StaffMember } from '../types';
import { RoleBadge } from './RoleBadge';
import './StaffDirectory.css';

interface StaffDirectoryProps {
  members: readonly StaffMember[];
  businessName: string;
  currentUserId: string;
}

export function StaffDirectory({ members, businessName, currentUserId }: StaffDirectoryProps) {
  return (
    <div className="staff-table-scroll" role="region" aria-label="Staff directory table" tabIndex={0}>
      <table className="staff-table">
        <caption className="sr-only">Staff members of {businessName}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email address</th>
            <th scope="col">Workspace role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.membershipId}>
              <th scope="row">
                <div className="staff-table__identity">
                  <span className={`staff-table__avatar staff-table__avatar--${member.role}`} aria-hidden="true">
                    {getStaffInitials(member.displayName)}
                  </span>
                  <span className="staff-table__name">
                    {member.displayName || 'Unnamed member'}
                    {member.userId === currentUserId && <span className="staff-table__you">You</span>}
                  </span>
                </div>
              </th>
              <td className="staff-table__email">{member.email}</td>
              <td><RoleBadge role={member.role} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
