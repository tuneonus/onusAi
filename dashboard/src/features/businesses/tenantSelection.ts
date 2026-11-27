import type { UserMembershipSummary } from '../auth/types';

export const ACTIVE_BUSINESS_STORAGE_KEY = 'onusai_active_business_id';

export function resolveActiveBusinessId(
  memberships: readonly UserMembershipSummary[],
  preferredBusinessId: string | null,
): string | null {
  if (memberships.length === 0) {
    return null;
  }

  if (preferredBusinessId) {
    const matching = memberships.find((item) => item.businessId === preferredBusinessId);

    if (matching) {
      return matching.businessId;
    }
  }

  return memberships[0].businessId;
}

export function readStoredBusinessId(): string | null {
  try {
    const value = window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY);
    return value && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writeStoredBusinessId(businessId: string | null): void {
  try {
    if (businessId) {
      window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, businessId);
    } else {
      window.localStorage.removeItem(ACTIVE_BUSINESS_STORAGE_KEY);
    }
  } catch {
    // Ignore storage write errors in restricted browser environments.
  }
}

