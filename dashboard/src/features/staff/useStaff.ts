import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '../../services/api/client';
import type { UserMembershipSummary } from '../auth/types';
import { listBusinessMembers } from './api';
import type { StaffDirectoryState } from './types';

// The owner workspace is keyed by account, business and membership in StaffPage.
// Switching scope unmounts it, clearing data before the next workspace renders.
export function useStaff(membership: UserMembershipSummary) {
  const { businessId, membershipId, businessName, role } = membership;
  const [state, setState] = useState<StaffDirectoryState>({ kind: 'loading' });
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await listBusinessMembers(
          { businessId, membershipId, businessName, role },
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setState({ kind: 'loaded', members: response.members });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiClientError && error.status === 403) {
          setState({ kind: 'forbidden' });
        } else if (error instanceof ApiClientError && error.status === 401) {
          // The shared client also expires the authenticated session.
          setState({ kind: 'unauthenticated' });
        } else {
          setState({
            kind: 'error',
            message: error instanceof ApiClientError
              ? error.message
              : 'Unable to load the staff directory. Please try again.',
          });
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [businessId, membershipId, businessName, role, refreshIndex]);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setRefreshIndex((index) => index + 1);
  }, []);

  return { state, retry };
}
