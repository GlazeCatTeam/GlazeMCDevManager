import { fail, ok, type Result } from "../errors";
import { MC_DEV_API, SESSION_COOKIE } from "./hosts";

const TIMEOUT_MS = 15_000;
const SUCCESS_STATUSES = new Set(["200", "201", "ok"]);
const EXPIRED_STATUSES = new Set(["401", "no_login"]);

/** The session a request runs with; only the session cookie value is sent */
export interface NeteaseSession {
  sessionCookie: string;
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
  return ok({ data: body.data as T, renewedSessionCookie: renewedSessionCookie(response.headers) });
}
