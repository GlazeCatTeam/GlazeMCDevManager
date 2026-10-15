import { PASSPORT_COOKIE, SESSION_COOKIE } from "../http/hosts";

/** Split a "a=1; b=2" cookie string into name/value pairs */
function parseCookieString(text: string): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of text.split(";")) {
    const index = part.indexOf("=");
    if (index > 0) {
      cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
    }
  }
  return cookies;
}

/**
 * Session cookie value from what the user pasted: a full cookie string, "NTES_SESS=…", or the bare value.
 * Returns null when nothing usable was pasted
 */
export function sessionCookieFromInput(input: string): string | null {
  const text = input.trim();
  if (text.length === 0) {
    return null;
  }
  if (text.includes("=")) {
    const value = parseCookieString(text).get(SESSION_COOKIE);
    return value && value.length > 0 ? value : null;
  }
  // A bare value cannot contain separators or whitespace
  return /^[^\s;,]+$/.test(text) ? text : null;
}

/** Passport account name from the P_INFO cookie value, e.g. "dev@163.com|1700000000|0|mcdev" → "dev@163.com" */
export function passportFromCookie(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the raw value when it is not URI-encoded
  }
  const name = decoded.split("|")[0]?.trim();
  return name && name.length > 0 ? name : null;
}

export { PASSPORT_COOKIE, SESSION_COOKIE };
