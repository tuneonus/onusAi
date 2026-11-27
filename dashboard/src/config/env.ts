function normalizeApiBaseUrl(rawValue: string | undefined): string {
  const trimmed = (rawValue ?? '').trim();

  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/\/+$/, '');
}

export const appEnv = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env?.VITE_API_BASE_URL),
} as const;

