import { config } from 'dotenv';

// This resolves to backend/.env in both src/config and dist/config.
const result = config({ path: new URL('../../.env', import.meta.url), quiet: true });

if (result.error && result.error.code !== 'ENOENT') {
  throw new Error('Unable to read the backend environment file.');
}

export function validateEnv(values: NodeJS.ProcessEnv) {
  const portValue = values.PORT ?? '3000';
  const port = Number(portValue);

  if (!/^\d+$/.test(portValue) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const nodeEnv = values.NODE_ENV ?? 'development';

  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be development, test, or production.');
  }

  const corsOrigins = (values.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((value) => {
      try {
        const origin = new URL(value.trim());

        if (
          (origin.protocol !== 'http:' && origin.protocol !== 'https:') ||
          origin.username || origin.password || origin.pathname !== '/' ||
          origin.search || origin.hash
        ) {
          throw new Error('Invalid origin.');
        }

        return origin.origin;
      } catch {
        throw new Error('CORS_ORIGIN must contain HTTP(S) origins without credentials, paths, queries, or fragments.');
      }
    });

  let aiServiceUrl: string;

  try {
    const serviceUrl = new URL(values.AI_SERVICE_URL ?? 'http://127.0.0.1:8001');

    if (
      (serviceUrl.protocol !== 'http:' && serviceUrl.protocol !== 'https:') ||
      serviceUrl.username || serviceUrl.password || serviceUrl.pathname !== '/' ||
      serviceUrl.search || serviceUrl.hash
    ) {
      throw new Error('Invalid AI service URL.');
    }

    aiServiceUrl = serviceUrl.origin;
  } catch {
    throw new Error('AI_SERVICE_URL must be an HTTP(S) origin without credentials, paths, queries, or fragments.');
  }

  const aiServiceTimeoutValue = values.AI_SERVICE_TIMEOUT_MS ?? '5000';
  const aiServiceTimeoutMs = Number(aiServiceTimeoutValue);

  if (
    !/^\d+$/.test(aiServiceTimeoutValue) || !Number.isInteger(aiServiceTimeoutMs) ||
    aiServiceTimeoutMs < 1 || aiServiceTimeoutMs > 60_000
  ) {
    throw new Error('AI_SERVICE_TIMEOUT_MS must be an integer between 1 and 60000.');
  }

  const databaseUrl = values.DATABASE_URL ?? '';

  try {
    const url = new URL(databaseUrl);

    if (
      (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
      !url.hostname || !url.username || url.pathname.length <= 1 ||
      url.hash || url.port === '0' || databaseUrl !== databaseUrl.trim()
    ) {
      throw new Error('Invalid database URL.');
    }

    // Reject malformed percent escapes before the driver decodes credentials.
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    decodeURIComponent(url.pathname);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL with a host, user, and database.');
  }

  const databaseConnectionTimeoutMs = boundedInt(values, 'DATABASE_CONNECTION_TIMEOUT_MS', 5000, 1, 60_000);
  const databaseIdleTimeoutMs = boundedInt(values, 'DATABASE_IDLE_TIMEOUT_MS', 30_000, 1, 60_000);
  const databaseQueryTimeoutMs = boundedInt(values, 'DATABASE_QUERY_TIMEOUT_MS', 5000, 1, 60_000);
  const authSessionTtlMs = boundedInt(values, 'AUTH_SESSION_TTL_MS', 28_800_000, 1000, 2_592_000_000);
  const authLoginMaxAttempts = boundedInt(values, 'AUTH_LOGIN_MAX_ATTEMPTS', 5, 1, 100);
  const authLoginWindowMs = boundedInt(values, 'AUTH_LOGIN_WINDOW_MS', 900_000, 1000, 86_400_000);
  const authLoginLockoutMs = boundedInt(values, 'AUTH_LOGIN_LOCKOUT_MS', 900_000, 1000, 86_400_000);
  const conversationRetentionDays = boundedInt(values, 'CONVERSATION_RETENTION_DAYS', 90, 1, 3650);

  return {
    port, nodeEnv, corsOrigins, aiServiceUrl, aiServiceTimeoutMs,
    databaseUrl, databaseConnectionTimeoutMs, databaseIdleTimeoutMs, databaseQueryTimeoutMs,
    authSessionTtlMs, authLoginMaxAttempts, authLoginWindowMs, authLoginLockoutMs,
    conversationRetentionDays,
  } as const;
}

function boundedInt(
  values: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const value = values[name] ?? String(defaultValue);
  const parsed = Number(value);

  if (!/^\d+$/.test(value) || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

export const env = validateEnv(process.env);
