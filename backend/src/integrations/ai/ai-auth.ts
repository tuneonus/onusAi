import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
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
