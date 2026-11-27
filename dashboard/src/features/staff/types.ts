import type { BusinessRole } from '../auth/types';

// Mirrors handleListBusinessMembers; dates are serialized as ISO strings.
export interface StaffMember {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string;
  role: BusinessRole;
  createdAt: string;
}

export interface StaffDirectoryResponse {
  businessId: string;
  members: StaffMember[];
}

export type StaffDirectoryState =
  | { kind: 'loading' }
  | { kind: 'loaded'; members: StaffMember[] }
  | { kind: 'forbidden' }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string };
