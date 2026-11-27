export type BusinessRole = 'owner' | 'operator';

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthenticatedSession {
  id: string;
  csrfTokenHash: string;
  expiresAt: Date;
}

export interface AuthContext {
  user: AuthenticatedUser;
  session: AuthenticatedSession;
}

export interface TenantContext {
  membershipId: string;
  businessId: string;
  businessName: string;
  role: BusinessRole;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      tenant?: TenantContext;
    }
  }
}

export {};

