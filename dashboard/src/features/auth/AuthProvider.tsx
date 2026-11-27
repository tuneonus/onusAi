import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ApiClientError,
  setCsrfToken,
  setUnauthorizedHandler,
} from '../../services/api/client';
import { fetchCurrentSession, loginStaff, logoutStaff } from './api';
import { AuthContext } from './authContext';
import type {
  AuthContextPayload,
  AuthSessionMeta,
  AuthStatus,
  AuthenticatedUser,
  LoginInput,
  UserMembershipSummary,
} from './types';

interface AuthState {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  memberships: UserMembershipSummary[];
  session: AuthSessionMeta | null;
  sessionNotice: string | null;
  restoreError: string | null;
}

const UNAUTHENTICATED_STATE: AuthState = {
  status: 'unauthenticated',
  user: null,
  memberships: [],
  session: null,
  sessionNotice: null,
  restoreError: null,
};

function toAuthenticatedState(payload: AuthContextPayload): AuthState {
  return {
    status: 'authenticated',
    user: payload.user,
    memberships: payload.memberships,
    session: payload.session,
    sessionNotice: null,
    restoreError: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    ...UNAUTHENTICATED_STATE,
    status: 'loading',
  });

  const applyAuthenticatedPayload = useCallback((payload: AuthContextPayload) => {
    setCsrfToken(payload.session.csrfToken);
    setState(toAuthenticatedState(payload));
  }, []);

  const handleSessionRestoreError = useCallback((error: unknown, signal?: AbortSignal) => {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      return;
    }

    setCsrfToken(null);

    if (error instanceof ApiClientError && error.status === 401) {
      setState(UNAUTHENTICATED_STATE);
      return;
    }

    const message =
      error instanceof ApiClientError
        ? error.message
        : 'Unable to verify your current session.';

    setState({
      ...UNAUTHENTICATED_STATE,
      restoreError: message,
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const payload = await fetchCurrentSession(controller.signal);

        if (controller.signal.aborted) {
          return;
        }

        applyAuthenticatedPayload(payload);
      } catch (error) {
        handleSessionRestoreError(error, controller.signal);
      }
    }

    void loadSession();

    return () => {
      controller.abort();
    };
  }, [applyAuthenticatedPayload, handleSessionRestoreError]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setState((previous) => {
        if (previous.status !== 'authenticated') {
          return previous;
        }

        return {
          ...UNAUTHENTICATED_STATE,
          sessionNotice: 'Your session has expired. Please sign in again.',
        };
      });
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const payload = await loginStaff(input);
    applyAuthenticatedPayload(payload);
  }, [applyAuthenticatedPayload]);

  const logout = useCallback(async () => {
    try {
      await logoutStaff();
    } catch (error) {
      // Treat an already-expired server session (401) as signed out locally.
      if (!(error instanceof ApiClientError && error.status === 401)) {
        throw error;
      }
    } finally {
      setCsrfToken(null);
      setState(UNAUTHENTICATED_STATE);
    }
  }, []);

  const clearSessionNotice = useCallback(() => {
    setState((previous) =>
      previous.sessionNotice ? { ...previous, sessionNotice: null } : previous,
    );
  }, []);

  const handleManualRestore = useCallback(async () => {
    setState((previous) => ({
      ...previous,
      status: 'loading',
      restoreError: null,
    }));

    try {
      const payload = await fetchCurrentSession();
      applyAuthenticatedPayload(payload);
    } catch (error) {
      handleSessionRestoreError(error);
    }
  }, [applyAuthenticatedPayload, handleSessionRestoreError]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        clearSessionNotice,
        login,
        logout,
        restoreSession: handleManualRestore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
