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

  return { port, nodeEnv, corsOrigins, aiServiceUrl, aiServiceTimeoutMs } as const;
}

export const env = validateEnv(process.env);
