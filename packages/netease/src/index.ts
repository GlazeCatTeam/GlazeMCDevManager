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
export {
  cancelPromotionDiscount,
  getPromotionActivities,
  getPromotionApplications,
  getPromotionDates,
  getPromotionDiscount,
  getPromotionModule,
  joinPromotion,
  savePromotionBanner,
} from "./endpoints/promotion";
export { getRankList, getRankPage } from "./endpoints/rank";
export { getUserInfo, type UserInfo } from "./endpoints/user";
export { validateWorkAdvanced } from "./endpoints/work-advanced";
export { createWork, validateWorkCreate } from "./endpoints/work-create";
export {
  getWorkEditorOptions,
  readWorkEditor,
  saveWorkEditor,
  submitWorkReview,
  validateWorkPatch,
} from "./endpoints/work-editor";
export { performWorkOperation } from "./endpoints/work-operations";
export { searchWorkReferences } from "./endpoints/work-references";
export { uploadWorkFile } from "./endpoints/work-upload";
export { getReviewFeedback, getWork, getWorksPage, listWorks, searchWorks } from "./endpoints/works";
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
