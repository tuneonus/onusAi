import type { StaffMember } from './types.ts';

export function summarizeStaff(members: readonly StaffMember[]) {
  return {
    total: members.length,
    owners: members.filter((member) => member.role === 'owner').length,
    operators: members.filter((member) => member.role === 'operator').length,
  };
}

export function getStaffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join('').toUpperCase();
  return `${Array.from(parts[0])[0]}${Array.from(parts[parts.length - 1])[0]}`.toUpperCase();
}
