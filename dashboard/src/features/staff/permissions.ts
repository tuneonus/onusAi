import type { BusinessRole } from '../auth/types';

export function canViewStaff(role: BusinessRole | null | undefined): boolean {
  return role === 'owner';
}

// Describes current Express route guards, including APIs whose dashboard UI is pending.
// This is display metadata, never an authorization boundary.
export const ROLE_PERMISSIONS = [
  { label: 'View business profile & locations', owner: true, operator: true },
  { label: 'Edit business profile & manage locations', owner: true, operator: false },
  { label: 'View staff directory', owner: true, operator: false },
  { label: 'View assistants & version history', owner: true, operator: true },
  { label: 'Configure & publish assistants', owner: true, operator: false },
  { label: 'Use playground & manage conversation status', owner: true, operator: true },
  { label: 'Delete & permanently purge conversations', owner: true, operator: false },
] as const;
