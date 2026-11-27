export type BusinessRole = 'owner' | 'operator';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

export interface UserMembershipSummary {
  membershipId: string;
  businessId: string;
  businessName: string;
  role: BusinessRole;
}

export interface AuthSessionMeta {
  expiresAt: string;
  csrfToken: string | null;
}

export interface AuthContextPayload {
  user: AuthenticatedUser;
  memberships: UserMembershipSummary[];
  session: AuthSessionMeta;
}

export interface LoginInput {
  email: string;
  password: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

