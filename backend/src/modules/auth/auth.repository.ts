import { postgresPool } from '../../integrations/database/postgres.js';
import type { AuthContext, BusinessRole } from '../../types/express.js';

export interface LoginUserRow {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
}

export interface UserMembershipSummary {
  membershipId: string;
  businessId: string;
  businessName: string;
  role: BusinessRole;
}

export interface CreatedSession {
  id: string;
  expiresAt: Date;
}

export interface LockoutRecord {
  scopeKey: string;
  lockedUntil: Date;
  now: Date;
}

export async function findUserForLogin(normalizedEmail: string): Promise<LoginUserRow | null> {
  const result = await postgresPool.query<{
    id: string;
    email: string;
    display_name: string;
    password_hash: string;
  }>(
    `SELECT u.id, u.email, u.display_name, uc.password_hash
     FROM users u
     INNER JOIN user_credentials uc ON uc.user_id = u.id
     WHERE lower(u.email) = $1
     LIMIT 1`,
    [normalizedEmail],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
  };
}

export async function listUserMemberships(userId: string): Promise<UserMembershipSummary[]> {
  const result = await postgresPool.query<{
    membership_id: string;
    business_id: string;
    business_name: string;
    role: BusinessRole;
  }>(
    `SELECT bm.id AS membership_id, bm.business_id, b.name AS business_name, bm.role
     FROM business_members bm
     INNER JOIN businesses b ON b.id = bm.business_id
     WHERE bm.user_id = $1
     ORDER BY b.created_at ASC, b.id ASC`,
    [userId],
  );

  return result.rows.map((row) => ({
    membershipId: row.membership_id,
    businessId: row.business_id,
    businessName: row.business_name,
    role: row.role,
  }));
}

export async function createStaffSession(params: {
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
}): Promise<CreatedSession> {
  const result = await postgresPool.query<{ id: string; expires_at: Date }>(
    `INSERT INTO staff_sessions (user_id, token_hash, csrf_token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, expires_at`,
    [params.userId, params.tokenHash, params.csrfTokenHash, params.expiresAt],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error('Failed to create staff session.');
  }

  return { id: row.id, expiresAt: row.expires_at };
}

export async function findActiveSessionByTokenHash(tokenHash: string): Promise<AuthContext | null> {
  const result = await postgresPool.query<{
    session_id: string;
    csrf_token_hash: string;
    expires_at: Date;
    user_id: string;
    email: string;
    display_name: string;
  }>(
    `SELECT
       s.id AS session_id,
       s.csrf_token_hash,
       s.expires_at,
       u.id AS user_id,
       u.email,
       u.display_name
     FROM staff_sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [tokenHash],
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
    },
    session: {
      id: row.session_id,
      csrfTokenHash: row.csrf_token_hash,
      expiresAt: row.expires_at,
    },
  };
}

export async function touchSessionLastSeen(sessionId: string): Promise<void> {
  await postgresPool.query(
    `UPDATE staff_sessions
     SET last_seen_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND revoked_at IS NULL
       AND last_seen_at < CURRENT_TIMESTAMP - interval '60 seconds'`,
    [sessionId],
  );
}

export async function revokeStaffSession(sessionId: string): Promise<void> {
  await postgresPool.query(
    `UPDATE staff_sessions
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId],
  );
}

export async function findActiveLockouts(scopeKeys: string[]): Promise<LockoutRecord[]> {
  const result = await postgresPool.query<{
    scope_key: string;
    locked_until: Date;
    now: Date;
  }>(
    `SELECT scope_key, locked_until, CURRENT_TIMESTAMP AS now
     FROM auth_login_attempts
     WHERE scope_key = ANY($1::text[])
       AND locked_until IS NOT NULL
       AND locked_until > CURRENT_TIMESTAMP`,
    [scopeKeys],
  );

  return result.rows.map((row) => ({
    scopeKey: row.scope_key,
    lockedUntil: row.locked_until,
    now: row.now,
  }));
}

export async function recordFailedLoginAttempt(params: {
  scopeKey: string;
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
}): Promise<void> {
  await postgresPool.query(
    `INSERT INTO auth_login_attempts (scope_key, failed_attempts, window_started_at, locked_until)
     VALUES (
       $1,
       1,
       CURRENT_TIMESTAMP,
       CASE WHEN 1 >= $2 THEN CURRENT_TIMESTAMP + ($4 * interval '1 millisecond') ELSE NULL END
     )
     ON CONFLICT (scope_key) DO UPDATE SET
       failed_attempts = CASE
         WHEN auth_login_attempts.locked_until IS NOT NULL AND auth_login_attempts.locked_until <= CURRENT_TIMESTAMP THEN 1
         WHEN auth_login_attempts.window_started_at + ($3 * interval '1 millisecond') <= CURRENT_TIMESTAMP THEN 1
         ELSE auth_login_attempts.failed_attempts + 1
       END,
       window_started_at = CASE
         WHEN (auth_login_attempts.locked_until IS NOT NULL AND auth_login_attempts.locked_until <= CURRENT_TIMESTAMP)
           OR (auth_login_attempts.window_started_at + ($3 * interval '1 millisecond') <= CURRENT_TIMESTAMP)
         THEN CURRENT_TIMESTAMP
         ELSE auth_login_attempts.window_started_at
       END,
       locked_until = CASE
         WHEN (
           CASE
             WHEN auth_login_attempts.locked_until IS NOT NULL AND auth_login_attempts.locked_until <= CURRENT_TIMESTAMP THEN 1
             WHEN auth_login_attempts.window_started_at + ($3 * interval '1 millisecond') <= CURRENT_TIMESTAMP THEN 1
             ELSE auth_login_attempts.failed_attempts + 1
           END
         ) >= $2 THEN CURRENT_TIMESTAMP + ($4 * interval '1 millisecond')
         ELSE NULL
       END`,
    [params.scopeKey, params.maxAttempts, params.windowMs, params.lockoutMs],
  );
}

export async function clearLoginAttempts(scopeKey: string): Promise<void> {
  await postgresPool.query('DELETE FROM auth_login_attempts WHERE scope_key = $1', [scopeKey]);
}

