/** Promise-based delay. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Generate a short unique id (non-cryptographic). */
export function generateId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return prefix ? `${prefix}_${time}${rand}` : `${time}${rand}`;
}

/** Check whether a unix epoch (ms) is in the past. */
export function isExpired(expiresAt: number, skewMs = 0): boolean {
  return Date.now() + skewMs >= expiresAt;
}

/** Parse JSON safely, returning a fallback on failure. */
export function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
