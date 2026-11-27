import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiClientError } from '../../services/api/client';
import type { UserMembershipSummary } from '../auth/types';
import { useAuth } from '../auth/useAuth';
import { getBusinessProfile, listUserBusinesses } from './api';
import { TenantContext } from './tenantContext';
import {
  readStoredBusinessId,
  resolveActiveBusinessId,
  writeStoredBusinessId,
} from './tenantSelection';
import type { BusinessProfile } from './types';

interface BusinessesListState {
  forUserId: string | null;
  items: UserMembershipSummary[];
  error: string | null;
  loaded: boolean;
}

interface ActiveProfileState {
  forBusinessId: string | null;
  profile: BusinessProfile | null;
  error: string | null;
  loaded: boolean;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { status, user, memberships } = useAuth();
  const userId = status === 'authenticated' && user ? user.id : null;

  const [preferredBusinessId, setPreferredBusinessId] = useState<string | null>(() =>
    readStoredBusinessId(),
  );
  const [businessesRefreshCount, setBusinessesRefreshCount] = useState(0);
  const [profileRefreshCount, setProfileRefreshCount] = useState(0);

  const [businessesState, setBusinessesState] = useState<BusinessesListState>({
    forUserId: null,
    items: [],
    error: null,
    loaded: false,
  });

  const [profileState, setProfileState] = useState<ActiveProfileState>({
    forBusinessId: null,
    profile: null,
    error: null,
    loaded: false,
  });

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const controller = new AbortController();

    async function loadBusinesses() {
      try {
        const response = await listUserBusinesses(controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setBusinessesState({
          forUserId: userId,
          items: response.businesses,
          error: null,
          loaded: true,
        });
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return;
        }

        setBusinessesState({
          forUserId: userId,
          items: memberships,
          error:
            error instanceof ApiClientError
              ? error.message
              : 'Unable to load businesses.',
          loaded: true,
        });
      }
    }

    void loadBusinesses();

    return () => {
      controller.abort();
    };
  }, [userId, memberships, businessesRefreshCount]);

  const businesses = userId
    ? businessesState.forUserId === userId && businessesState.loaded
      ? businessesState.items
      : memberships
    : [];

  const activeBusinessId = userId
    ? resolveActiveBusinessId(businesses, preferredBusinessId)
    : null;

  const activeMembership =
    activeBusinessId
      ? businesses.find((entry) => entry.businessId === activeBusinessId) ?? null
      : null;

  useEffect(() => {
    if (!userId || !activeBusinessId) {
      return undefined;
    }

    writeStoredBusinessId(activeBusinessId);
    const controller = new AbortController();

    async function loadProfile(targetBusinessId: string) {
      try {
        const response = await getBusinessProfile(targetBusinessId, controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        setProfileState({
          forBusinessId: targetBusinessId,
          profile: response.business,
          error: null,
          loaded: true,
        });
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return;
        }

        setProfileState({
          forBusinessId: targetBusinessId,
          profile: null,
          error:
            error instanceof ApiClientError
              ? error.message
              : 'Unable to load business profile.',
          loaded: true,
        });
      }
    }

    void loadProfile(activeBusinessId);

    return () => {
      controller.abort();
    };
  }, [userId, activeBusinessId, profileRefreshCount]);

  const selectBusiness = useCallback((businessId: string) => {
    setPreferredBusinessId(businessId);
    writeStoredBusinessId(businessId);
  }, []);

  const refreshBusinesses = useCallback(async () => {
    if (!userId) {
      return;
    }

    const response = await listUserBusinesses();
    setBusinessesState({
      forUserId: userId,
      items: response.businesses,
      error: null,
      loaded: true,
    });
    setBusinessesRefreshCount((count) => count + 1);
  }, [userId]);

  const refreshActiveProfile = useCallback(async () => {
    if (!activeBusinessId) {
      return;
    }

    const response = await getBusinessProfile(activeBusinessId);
    setProfileState({
      forBusinessId: activeBusinessId,
      profile: response.business,
      error: null,
      loaded: true,
    });
    setProfileRefreshCount((count) => count + 1);
  }, [activeBusinessId]);

  const registerCreatedBusiness = useCallback(
    (business: BusinessProfile, membership: UserMembershipSummary) => {
      if (!userId) {
        return;
      }

      setBusinessesState((previous) => {
        const current =
          previous.forUserId === userId && previous.loaded
            ? previous.items
            : memberships;
        const withoutDuplicate = current.filter(
          (entry) => entry.businessId !== membership.businessId,
        );

        return {
          forUserId: userId,
          items: [...withoutDuplicate, membership],
          error: null,
          loaded: true,
        };
      });

      setPreferredBusinessId(business.id);
      writeStoredBusinessId(business.id);
      setProfileState({
        forBusinessId: business.id,
        profile: business,
        error: null,
        loaded: true,
      });
    },
    [userId, memberships],
  );

  const applyUpdatedBusiness = useCallback(
    (business: BusinessProfile) => {
      if (!userId) {
        return;
      }

      setProfileState({
        forBusinessId: business.id,
        profile: business,
        error: null,
        loaded: true,
      });

      setBusinessesState((previous) => {
        const current =
          previous.forUserId === userId && previous.loaded
            ? previous.items
            : memberships;

        return {
          forUserId: userId,
          items: current.map((entry) =>
            entry.businessId === business.id
              ? { ...entry, businessName: business.name }
              : entry,
          ),
          error: null,
          loaded: true,
        };
      });
    },
    [userId, memberships],
  );

  const isLoadingBusinesses =
    Boolean(userId) && (!businessesState.loaded || businessesState.forUserId !== userId);
  const isLoadingProfile =
    Boolean(activeBusinessId) &&
    (!profileState.loaded || profileState.forBusinessId !== activeBusinessId);

  const activeBusiness =
    activeBusinessId && profileState.forBusinessId === activeBusinessId
      ? profileState.profile
      : null;

  return (
    <TenantContext.Provider
      value={{
        businesses,
        activeBusinessId,
        activeMembership,
        activeBusiness,
        isLoadingBusinesses,
        isLoadingProfile,
        businessesError: businessesState.forUserId === userId ? businessesState.error : null,
        profileError:
          profileState.forBusinessId === activeBusinessId ? profileState.error : null,
        selectBusiness,
        refreshBusinesses,
        refreshActiveProfile,
        registerCreatedBusiness,
        applyUpdatedBusiness,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

