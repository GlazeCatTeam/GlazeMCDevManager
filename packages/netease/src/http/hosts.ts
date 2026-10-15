// NetEase addresses in one place so a platform move only changes this file

/** Developer platform JSON API */
export const MC_DEV_API = "https://mc-launcher.webapp.163.com";

/** Official developer platform login page, opened in the login window */
export const OFFICIAL_LOGIN_URL = "https://mcdev.webapp.163.com/#/login/";

/** Developer platform home; the login page navigates here once signed in */
export const OFFICIAL_HOME_URL = "https://mcdev.webapp.163.com/";

/** Session cookie that authenticates developer API requests */
export const SESSION_COOKIE = "NTES_SESS";

/** Cookie holding the passport account name, e.g. "dev@163.com|1700000000|..." */
export const PASSPORT_COOKIE = "P_INFO";

// Hosts the login window may navigate to: NetEase pages, passport and captcha services
const loginWindowHostSuffixes = [".163.com", ".netease.com", ".126.net", ".127.net", ".163yun.com", ".netease.im"];

/** Whether the login window may load this URL; everything else is blocked */
export function isLoginWindowUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") {
      return false;
    }
    return loginWindowHostSuffixes.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
  } catch {
    return false;
  }
}
