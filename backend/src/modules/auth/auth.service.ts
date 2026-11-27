import { env } from '../../config/env.js';
import type { AuthContext, AuthenticatedUser } from '../../types/express.js';
import { HttpError } from '../../utils/http-error.js';
import { verifyDummyPassword, verifyPassword } from '../../utils/password.js';
import { generateOpaqueToken, hashToken, safeTokenMatchesHash } from '../../utils/tokens.js';
import {
  clearLoginAttempts,
  createStaffSession,
  findActiveLockouts,
  findActiveSessionByTokenHash,
  findUserForLogin,
  listUserMemberships,
  recordFailedLoginAttempt,
  revokeStaffSession,
  touchSessionLastSeen,
  type UserMembershipSummary,
} from './auth.repository.js';

const IP_RATE_LIMIT_MULTIPLIER = 4;

export interface LoginResult {
  user: AuthenticatedUser;
  memberships: UserMembershipSummary[];
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
}

export interface CurrentAuthResult {
  user: AuthenticatedUser;
  memberships: UserMembershipSummary[];
  session: {
    expiresAt: string;
    csrfToken: string | null;
  };
}

export async function loginStaff(params: {
  email: string;
  password: string;
  clientIp: string;
}): Promise<LoginResult> {
  const emailScopeKey = hashToken(`email:${params.email}`);
  const ipScopeKey = hashToken(`ip:${params.clientIp || 'unknown'}`);

  const lockouts = await findActiveLockouts([emailScopeKey, ipScopeKey]);

  if (lockouts.length > 0) {
    const maxRetryAfterMs = Math.max(
      ...lockouts.map((lockout) => lockout.lockedUntil.getTime() - lockout.now.getTime()),
    );
    const retryAfterSeconds = Math.max(1, Math.ceil(maxRetryAfterMs / 1000));

    throw new HttpError(
      429,
      'TOO_MANY_LOGIN_ATTEMPTS',
      'Too many login attempts. Please try again later.',
      { 'Retry-After': String(retryAfterSeconds) },
    );
  }

  const user = await findUserForLogin(params.email);
  let passwordValid = false;

  if (user) {
    passwordValid = await verifyPassword(params.password, user.passwordHash);
  } else {
    await verifyDummyPassword(params.password);
  }

  if (!user || !passwordValid) {
    await Promise.all([
      recordFailedLoginAttempt({
        scopeKey: emailScopeKey,
        maxAttempts: env.authLoginMaxAttempts,
        windowMs: env.authLoginWindowMs,
        lockoutMs: env.authLoginLockoutMs,
      }),
      recordFailedLoginAttempt({
        scopeKey: ipScopeKey,
        maxAttempts: env.authLoginMaxAttempts * IP_RATE_LIMIT_MULTIPLIER,
        windowMs: env.authLoginWindowMs,
        lockoutMs: env.authLoginLockoutMs,
      }),
    ]);

    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  await clearLoginAttempts(emailScopeKey);

  const sessionToken = generateOpaqueToken();
  const csrfToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + env.authSessionTtlMs);

  const session = await createStaffSession({
    userId: user.id,
    tokenHash: hashToken(sessionToken),
    csrfTokenHash: hashToken(csrfToken),
    expiresAt,
  });

  const memberships = await listUserMemberships(user.id);

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    memberships,
    sessionToken,
    csrfToken,
    expiresAt: session.expiresAt,
  };
}

export async function authenticateSessionToken(sessionToken: string): Promise<AuthContext | null> {
  if (!sessionToken) {
    return null;
  }

  const auth = await findActiveSessionByTokenHash(hashToken(sessionToken));

  if (!auth) {
    return null;
  }

  await touchSessionLastSeen(auth.session.id);
  return auth;
}

export async function getCurrentAuthContext(
  auth: AuthContext,
  csrfCookieValue: string | undefined,
): Promise<CurrentAuthResult> {
  const memberships = await listUserMemberships(auth.user.id);
  const csrfToken = csrfCookieValue && safeTokenMatchesHash(csrfCookieValue, auth.session.csrfTokenHash)
    ? csrfCookieValue
    : null;

  return {
    user: auth.user,
    memberships,
    session: {
      expiresAt: auth.session.expiresAt.toISOString(),
      csrfToken,
    },
  };
}

export async function logoutStaff(sessionId: string): Promise<void> {
  await revokeStaffSession(sessionId);
}

