import { fail, ok, type Result } from "../errors";
import { getMcDev, type McDevResponse, type NeteaseSession } from "../http/client";

/** Developer profile from GET /users/me; the platform returns no developer UID here */
export interface UserInfo {
  nickname: string;
  avatarUrl: string | null;
  level: number;
  exp: number;
}

/** Fields of the raw /users/me payload this app reads */
interface RawUserInfo {
  nickname?: unknown;
  head_img?: unknown;
  level?: unknown;
  exp?: unknown;
}

/** Fetch the signed-in developer's profile; also the cheapest way to verify a session */
export async function getUserInfo(session: NeteaseSession): Promise<Result<McDevResponse<UserInfo>>> {
  const result = await getMcDev<RawUserInfo>("users.me", "/users/me", session);
  if (!result.ok) {
    return result;
  }
  const raw = result.value.data;
  // Required fields missing means the response changed; never fill in defaults
  if (typeof raw.nickname !== "string" || typeof raw.level !== "number") {
    return fail({ kind: "parse", endpoint: "users.me" });
  }
  return ok({
    renewedSessionCookie: result.value.renewedSessionCookie,
    data: {
      nickname: raw.nickname,
      avatarUrl: typeof raw.head_img === "string" && raw.head_img.length > 0 ? raw.head_img : null,
      level: raw.level,
      exp: typeof raw.exp === "number" ? raw.exp : 0,
    },
  });
}
