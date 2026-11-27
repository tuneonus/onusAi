/** Parse an HTTP Cookie header into a name-value map without throwing on malformed segments. */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};

  for (const segment of cookieHeader.split(';')) {
    const separatorIndex = segment.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const name = segment.slice(0, separatorIndex).trim();
    const rawValue = segment.slice(separatorIndex + 1).trim();

    if (!name) {
      continue;
    }

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

