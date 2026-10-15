// NetEase platform adapter; runs only in the main process

export { passportFromCookie, sessionCookieFromInput } from "./auth/cookie";
export { getAnalyticsOverview, getDeveloperLevel } from "./endpoints/developer";
export { getRankList } from "./endpoints/rank";
export { getUserInfo, type UserInfo } from "./endpoints/user";
export { getWorkEditorOptions, readWorkEditor, saveWorkEditor, submitWorkReview } from "./endpoints/work-editor";
export { uploadWorkFile } from "./endpoints/work-upload";
export { getReviewFeedback, getWork, listWorks } from "./endpoints/works";
export { describeError, fail, type NeteaseError, ok, type Result } from "./errors";
export type { McDevResponse, NeteaseSession } from "./http/client";
export {
  isLoginWindowUrl,
  isNeteaseImageUrl,
  MC_DEV_API,
  OFFICIAL_HOME_URL,
  OFFICIAL_LOGIN_URL,
  PASSPORT_COOKIE,
  SESSION_COOKIE,
} from "./http/hosts";
export { estimateIncome, monthOf, parseMonth } from "./income/estimate";
export { estimateProfit, incomeTax } from "./income/rules";
