export const CSRF_COOKIE_NAME = 'onusai_csrf';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) {
    return null;
  }

  const pairs = document.cookie.split(';');

  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const cookieName = pair.slice(0, separatorIndex).trim();

    if (cookieName === name) {
      const rawValue = pair.slice(separatorIndex + 1).trim();

      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }

  return null;
}

