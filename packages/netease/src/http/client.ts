import { fail, ok, type Result } from "../errors";
import { MC_DEV_API, SESSION_COOKIE } from "./hosts";

const TIMEOUT_MS = 15_000;
const SUCCESS_STATUSES = new Set(["200", "201", "ok"]);
const EXPIRED_STATUSES = new Set(["401", "no_login"]);

/** The session a request runs with; only the session cookie value is sent */
export interface NeteaseSession {
  sessionCookie: string;
  /** Called when a response rotates the session cookie, so the owner can store the new one */
  onRenewed?: ((sessionCookie: string) => void) | undefined;
}

/** Envelope of every developer API response */
interface ResponseEnvelope {
  status?: unknown;
  data?: unknown;
  msg?: unknown;
}

export interface McDevResponse<T> {
  data: T;
  /** A refreshed session cookie from Set-Cookie, when the platform rotated it */
  renewedSessionCookie: string | null;
}

/** Append query parameters to a path, skipping undefined values */
export function withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const text = query.toString();
  if (text.length === 0) {
    return path;
  }
  return `${path}${path.includes("?") ? "&" : "?"}${text}`;
}

/** Read the session cookie from Set-Cookie headers, if the response rotated it */
function renewedSessionCookie(headers: Headers): string | null {
  for (const line of headers.getSetCookie()) {
    const [pair] = line.split(";");
    const index = pair?.indexOf("=") ?? -1;
    if (pair && index > 0 && pair.slice(0, index).trim() === SESSION_COOKIE) {
      const value = pair.slice(index + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * GET a developer API path with the account's session cookie.
 * Only "not logged in" from NetEase counts as an expired session; timeouts and network errors do not
 */
export async function getMcDev<T>(
  endpoint: string,
  path: string,
  session: NeteaseSession,
): Promise<Result<McDevResponse<T>>> {
  let response: Response;
  try {
    response = await fetch(`${MC_DEV_API}${path}`, {
      headers: { Accept: "application/json", Cookie: `${SESSION_COOKIE}=${session.sessionCookie}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return fail({ kind: "timeout" });
    }
    return fail({ kind: "network", cause: error instanceof Error ? error.message : String(error) });
  }

  if (response.status === 401) {
    return fail({ kind: "session_expired" });
  }

  let body: ResponseEnvelope;
  try {
    body = (await response.json()) as ResponseEnvelope;
  } catch {
    return fail({ kind: "parse", endpoint });
  }

  const status = String(body.status ?? response.status).toLowerCase();
  if (EXPIRED_STATUSES.has(status)) {
    return fail({ kind: "session_expired" });
  }
  if (!SUCCESS_STATUSES.has(status)) {
    return fail({ kind: "business", code: status, message: typeof body.msg === "string" ? body.msg : "" });
  }
  if (body.data === undefined || body.data === null) {
    return fail({ kind: "parse", endpoint });
  }
  const renewed = renewedSessionCookie(response.headers);
  if (renewed && renewed !== session.sessionCookie) {
    session.onRenewed?.(renewed);
  }
  return ok({ data: body.data as T, renewedSessionCookie: renewed });
}

/** GET a developer API path and keep only the payload; session rotation goes through session.onRenewed */
export async function getMcDevData(endpoint: string, path: string, session: NeteaseSession): Promise<Result<unknown>> {
  const result = await getMcDev<unknown>(endpoint, path, session);
  return result.ok ? ok(result.value.data) : fail(result.error);
}
