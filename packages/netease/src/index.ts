// NetEase platform adapter; runs only in the main process

export { passportFromCookie, sessionCookieFromInput } from "./auth/cookie";
export { getUserInfo, type UserInfo } from "./endpoints/user";
export { describeError, fail, type NeteaseError, ok, type Result } from "./errors";
export type { McDevResponse, NeteaseSession } from "./http/client";
export {
  isLoginWindowUrl,
  MC_DEV_API,
  OFFICIAL_HOME_URL,
  OFFICIAL_LOGIN_URL,
  PASSPORT_COOKIE,
  SESSION_COOKIE,
} from "./http/hosts";
