import { createContext } from 'react';
import type { UserMembershipSummary } from '../auth/types';
import type { BusinessProfile } from './types';

export interface TenantContextValue {
  businesses: UserMembershipSummary[];
  activeBusinessId: string | null;
  activeMembership: UserMembershipSummary | null;
  activeBusiness: BusinessProfile | null;
  isLoadingBusinesses: boolean;
  isLoadingProfile: boolean;
  businessesError: string | null;
  profileError: string | null;
  selectBusiness: (businessId: string) => void;
  refreshBusinesses: () => Promise<void>;
  refreshActiveProfile: () => Promise<void>;
  registerCreatedBusiness: (
    business: BusinessProfile,
    membership: UserMembershipSummary,
  ) => void;
  applyUpdatedBusiness: (business: BusinessProfile) => void;
}

export const TenantContext = createContext<TenantContextValue | null>(null);

