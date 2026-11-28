import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { HttpError } from '../../utils/http-error.js';
import { validateAiDelegationClaims, type AiDelegationClaims } from './ai-contract.js';

const SERVICE_SUBJECT = 'service:backend';
const MIN_SECRET_LENGTH = 32;

export interface InternalServiceTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  scope: string;
  delegation?: AiDelegationClaims;
}

export interface SignInternalServiceTokenOptions {
  secret: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
  scope: string;
  subject?: string;
  nowSeconds?: number;
  jti?: string;
  delegation?: AiDelegationClaims | undefined;
}

function encodeBase64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * Sign a short-lived HS256 JWT for Node.js-to-FastAPI service authentication
 * and optional tenant/conversation scoped delegation.
 */
export function signInternalServiceToken(options: SignInternalServiceTokenOptions): string {
  const subject = options.subject ?? SERVICE_SUBJECT;

  if (options.secret.length < MIN_SECRET_LENGTH) {
    throw new Error('Internal auth signing secret must be at least 32 characters.');
  }

  if (!options.issuer || !options.audience || !subject || !options.scope.trim()) {
    throw new Error('Internal service token claims must be non-empty.');
  }

  if (!Number.isInteger(options.ttlSeconds) || options.ttlSeconds < 1) {
    throw new Error('Internal service token TTL must be a positive integer.');
  }

  const issuedAt = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!Number.isInteger(issuedAt) || issuedAt < 0) {
    throw new Error('Internal service token issued-at timestamp must be a non-negative integer.');
  }

  const claims: InternalServiceTokenClaims = {
    iss: options.issuer,
    aud: options.audience,
    sub: subject,
    iat: issuedAt,
    exp: issuedAt + options.ttlSeconds,
    jti: options.jti ?? randomBytes(16).toString('base64url'),
    scope: options.scope.trim(),
  };

  if (options.delegation !== undefined) {
    claims.delegation = validateAiDelegationClaims(options.delegation);
  }

  const encodedHeader = encodeBase64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = encodeBase64UrlJson(claims);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', options.secret)
    .update(signingInput, 'ascii')
    .digest('base64url');

  return `${signingInput}.${signature}`;
}

export interface CreateInternalServiceTokenOptions {
  delegation?: AiDelegationClaims;
  maxTtlSeconds?: number;
}

/** Mint a fresh short-lived service token using validated runtime settings. */
export function createInternalServiceToken(
  scope: string,
  options?: CreateInternalServiceTokenOptions,
): string {
  const requestedMax = options?.maxTtlSeconds;
  const ttlSeconds =
    requestedMax !== undefined && Number.isInteger(requestedMax) && requestedMax >= 1
      ? Math.min(env.aiInternalAuthTokenTtlSeconds, requestedMax)
      : env.aiInternalAuthTokenTtlSeconds;

  return signInternalServiceToken({
    secret: env.aiInternalAuthSecret,
    issuer: env.aiInternalAuthIssuer,
    audience: env.aiInternalAuthAudience,
    ttlSeconds,
    scope,
    delegation: options?.delegation,
  });
}

const MAX_WORKER_TOKEN_LENGTH = 4096;
const BASE64URL_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const EXPECTED_WORKER_SUBJECT = 'service:ai-worker';

export interface VerifiedWorkerTokenContext {
  issuer: string;
  audience: string;
  subject: string;
  tokenId: string;
  scopes: ReadonlySet<string>;
  issuedAt: number;
  expiresAt: number;
}

function decodeCanonicalBase64Url(segment: string): Buffer {
  if (!segment || !BASE64URL_SEGMENT_PATTERN.test(segment)) {
    throw new Error('Invalid base64url segment.');
  }

  const decoded = Buffer.from(segment, 'base64url');
  if (decoded.toString('base64url') !== segment) {
    throw new Error('Non-canonical base64url encoding.');
  }

  return decoded;
}

function decodeJwtJsonObject(segment: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(decodeCanonicalBase64Url(segment).toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('JWT segment must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

/**
 * Verify a short-lived HS256 JWT minted by the Python AI worker for internal
 * callbacks to the Node.js backend.
 */
export function verifyInternalWorkerToken(
  token: string,
  requiredScope: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifiedWorkerTokenContext {
  if (!token || token.length > MAX_WORKER_TOKEN_LENGTH) {
    throw new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Invalid internal service token.');
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Invalid internal service token.');
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: Record<string, unknown>;
  let actualSignature: Buffer;

  try {
    header = decodeJwtJsonObject(headerB64);
    actualSignature = decodeCanonicalBase64Url(signatureB64);
  } catch {
    throw new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Invalid internal service token.');
  }

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Invalid internal service token.');
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSignature = createHmac('sha256', env.aiInternalAuthSecret)
    .update(signingInput, 'ascii')
    .digest();

  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Invalid internal service token.');
  }

  let payload: Record<string, unknown>;
  try {
    payload = decodeJwtJsonObject(payloadB64);
  } catch {
    throw new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Invalid internal service token.');
  }

  const { iss, aud, sub, jti, scope, iat, exp } = payload;

  if (
    iss !== env.aiInternalAuthAudience ||
    aud !== env.aiInternalAuthIssuer ||
    sub !== EXPECTED_WORKER_SUBJECT ||
    typeof jti !== 'string' ||
    !jti.trim() ||
    typeof scope !== 'string' ||
    !scope.trim() ||
    typeof iat !== 'number' ||
    !Number.isInteger(iat) ||
    typeof exp !== 'number' ||
    !Number.isInteger(exp)
  ) {
    throw new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Invalid internal service token.');
  }

  if (exp <= nowSeconds || iat > nowSeconds || exp <= iat || exp - iat > 300) {
    throw new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Internal service token is expired or invalid.');
  }

  const scopes = new Set(scope.split(/\s+/).filter(Boolean));
  if (!scopes.has(requiredScope)) {
    throw new HttpError(403, 'INTERNAL_AUTH_FORBIDDEN', 'Internal service token lacks required scope.');
  }

  return {
    issuer: iss,
    audience: aud,
    subject: sub,
    tokenId: jti,
    scopes,
    issuedAt: iat,
    expiresAt: exp,
  };
}
