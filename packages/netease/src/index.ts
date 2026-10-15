// NetEase platform adapter; runs only in the main process

export { passportFromCookie, sessionCookieFromInput } from "./auth/cookie";
export {
  getAnalyticsDaily,
  getAnalyticsMonthly,
  getAnalyticsRealtime,
} from "./endpoints/analytics";
export { listComments, replyComment } from "./endpoints/comments";
export { getAnalyticsOverview, getDeveloperLevel } from "./endpoints/developer";
export { listFeedback, readFeedbackLog, replyFeedback } from "./endpoints/feedback";
export { getIncomeDetail, getIncomeList } from "./endpoints/income";
export {
  deleteMessages,
  getMessage,
  getMessageUnreadCount,
  listMessages,
  markAllMessagesRead,
} from "./endpoints/messages";
export { getRankList } from "./endpoints/rank";
export { getUserInfo, type UserInfo } from "./endpoints/user";
export { createWork } from "./endpoints/work-create";
export { getWorkEditorOptions, readWorkEditor, saveWorkEditor, submitWorkReview } from "./endpoints/work-editor";
export { performWorkOperation } from "./endpoints/work-operations";
export { uploadWorkFile } from "./endpoints/work-upload";
export { getReviewFeedback, getWork, getWorksPage, listWorks } from "./endpoints/works";
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
export { getAnalyticsPeriodIncome } from "./income/period";
export { estimateProfit, incomeTax } from "./income/rules";
