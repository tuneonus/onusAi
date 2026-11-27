import { createContext } from 'react';
import type {
  AuthSessionMeta,
  AuthStatus,
  AuthenticatedUser,
  LoginInput,
  UserMembershipSummary,
} from './types';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  memberships: UserMembershipSummary[];
  session: AuthSessionMeta | null;
  sessionNotice: string | null;
  restoreError: string | null;
  clearSessionNotice: () => void;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

