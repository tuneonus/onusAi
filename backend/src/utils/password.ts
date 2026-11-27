import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const MIN_ALLOWED_COST = 16_384;
const MAX_ALLOWED_COST = 65_536;
const MAX_ALLOWED_BLOCK_SIZE = 16;
const MAX_ALLOWED_PARALLELIZATION = 4;

const DUMMY_SALT = Buffer.alloc(SCRYPT_SALT_BYTES, 0x5a);
const DUMMY_DIGEST = Buffer.alloc(SCRYPT_KEY_LENGTH, 0xa5);

const HASH_PATTERN = /^scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

/** Hash a plaintext password with a fresh 128-bit random salt using Node.js crypto.scrypt. */
export async function hashPassword(password: string): Promise<string> {
  if (!password) {
    throw new Error('Password must not be empty.');
  }

  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAXMEM,
  });

  return [
    'scrypt',
    `N=${SCRYPT_COST},r=${SCRYPT_BLOCK_SIZE},p=${SCRYPT_PARALLELIZATION}`,
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

/** Verify a password against a stored scrypt hash in constant time. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const match = HASH_PATTERN.exec(storedHash);

  if (!password || !match) {
    return false;
  }

  const cost = Number(match[1]);
  const blockSize = Number(match[2]);
  const parallelization = Number(match[3]);
  const salt = Buffer.from(match[4] ?? '', 'base64url');
  const expectedKey = Buffer.from(match[5] ?? '', 'base64url');

  if (
    !Number.isInteger(cost) || cost < MIN_ALLOWED_COST || cost > MAX_ALLOWED_COST ||
    (cost & (cost - 1)) !== 0 ||
    !Number.isInteger(blockSize) || blockSize < 1 || blockSize > MAX_ALLOWED_BLOCK_SIZE ||
    !Number.isInteger(parallelization) || parallelization < 1 || parallelization > MAX_ALLOWED_PARALLELIZATION ||
    salt.length < SCRYPT_SALT_BYTES || expectedKey.length !== SCRYPT_KEY_LENGTH
  ) {
    return false;
  }

  const derivedKey = await scryptAsync(password, salt, expectedKey.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: SCRYPT_MAXMEM,
  });

  return derivedKey.length === expectedKey.length && timingSafeEqual(derivedKey, expectedKey);
}

/** Run scrypt work when no user record exists to reduce login timing differences. */
export async function verifyDummyPassword(password: string): Promise<void> {
  const derivedKey = await scryptAsync(password, DUMMY_SALT, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAXMEM,
  });

  timingSafeEqual(derivedKey, DUMMY_DIGEST);
}

