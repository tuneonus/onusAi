import { ApiClientError, apiRequest } from '../../services/api/client.ts';
import type { UserMembershipSummary } from '../auth/types';
import { canViewStaff } from './permissions.ts';
import type { StaffDirectoryResponse, StaffMember } from './types.ts';

function isStaffMember(value: unknown): value is StaffMember {
  if (typeof value !== 'object' || value === null) return false;
  const member = value as Record<string, unknown>;
  return (
    typeof member.membershipId === 'string' && member.membershipId.length > 0 &&
    typeof member.userId === 'string' && member.userId.length > 0 &&
    typeof member.displayName === 'string' &&
    typeof member.email === 'string' &&
    (member.role === 'owner' || member.role === 'operator') &&
    typeof member.createdAt === 'string' && Number.isFinite(Date.parse(member.createdAt))
  );
}

export async function listBusinessMembers(
  membership: UserMembershipSummary,
  signal: AbortSignal,
): Promise<StaffDirectoryResponse> {
  signal.throwIfAborted();
  if (!membership.businessId || !canViewStaff(membership.role)) {
    throw new ApiClientError({
      status: 403,
      code: 'INSUFFICIENT_PERMISSIONS',
      message: 'Only business owners can view the staff directory.',
    });
  }

  const response = await apiRequest<unknown>(
    `/businesses/${encodeURIComponent(membership.businessId)}/members`,
    { signal },
  );
  // Also guard transports which resolve after cancellation.
  signal.throwIfAborted();
  if (
    typeof response !== 'object' || response === null ||
    !('businessId' in response) || response.businessId !== membership.businessId ||
    !('members' in response) || !Array.isArray(response.members) ||
    !response.members.every(isStaffMember)
  ) {
    throw new ApiClientError({
      status: 502,
      code: 'INVALID_STAFF_RESPONSE',
      message: 'The staff directory response could not be verified. Please try again.',
    });
  }
  return { businessId: membership.businessId, members: response.members };
}
