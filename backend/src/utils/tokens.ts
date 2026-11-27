import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const OPAQUE_TOKEN_BYTES = 32;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** Generate a cryptographically random 256-bit URL-safe opaque token. */
export function generateOpaqueToken(): string {
  return randomBytes(OPAQUE_TOKEN_BYTES).toString('base64url');
}

/** Compute the lowercase SHA-256 hex digest of an opaque token or rate-limit key. */
export function hashToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Compare a raw token against a stored SHA-256 hex digest in constant time. */
export function safeTokenMatchesHash(token: string, expectedHashHex: string): boolean {
  if (!token || !SHA256_HEX_PATTERN.test(expectedHashHex)) {
    return false;
  }

  const actualDigest = createHash('sha256').update(token, 'utf8').digest();
  const expectedDigest = Buffer.from(expectedHashHex, 'hex');

  return actualDigest.length === expectedDigest.length && timingSafeEqual(actualDigest, expectedDigest);
}

