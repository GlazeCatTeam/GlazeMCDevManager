// Temporary hand-written contracts; replaced by Zod schemas in M1
import type { AccountChanged, AccountSummary, InitialRoute, LoginStep } from "./account";
import type {
  AnalyticsDailyParams,
  AnalyticsPeriodIncome,
  AnalyticsPeriodIncomeParams,
  AnalyticsRangeParams,
  AnalyticsRealtime,
  AnalyticsRealtimeParams,
  AnalyticsRecord,
} from "./analytics";
import type { AppearanceSettings } from "./appearance";
import type { CommentListParams, CommentPage, CommentReplyParams } from "./comments";
import type { AccountParams, AnalyticsOverview, DeveloperLevel } from "./developer";
import type { FeedbackListParams, FeedbackPageData, FeedbackReplyParams } from "./feedback";
import type { CacheClearResult, GeneralSettings, GeneralState } from "./general";
import type {
  IncomeDetail,
  IncomeDetailParams,
  IncomeEstimate,
  IncomeEstimateParams,
  IncomeList,
  IncomeListParams,
  IncomePlatform,
} from "./income";
import type { LogPage, LogQuery } from "./logs";
import type { McpDraft, McpGrant, McpInvitation, McpSnapshot } from "./mcp";
import type { MessageContent, MessageDeleteParams, MessageListParams, MessagePage, MessageParams } from "./messages";
import type { PluginInstallPreview, PluginSnapshot } from "./plugins";
import type {
  BannerApplication,
  BannerSaveParams,
  PromotionActivity,
  PromotionDates,
  PromotionJoinParams,
  PromotionModuleData,
  PromotionModuleParams,
  PromotionPageParams,
} from "./promotion";
import type { RankBoard, RankEntry, RankListParams, RankPage, RankPageParams } from "./rank";
import type { SessionSettings } from "./session-settings";
import type { WorkCropParams, WorkImageDraft, WorkImageParams, WorkReference, WorkSearchParams } from "./work-assets";
import type { WorkCreateParams } from "./work-create";
import type {
  WorkEditorDocument,
  WorkEditorOptions,
  WorkRecord,
  WorkReviewResult,
  WorkSaveParams,
  WorkUpload,
  WorkUploadParams,
} from "./work-editor";
import type { WorkOperationParams, WorkOperationResult } from "./work-operations";
import type { WorkResourceUploadParams } from "./work-resource";
import type {
  WorkDetail,
  WorkPage,
  WorkPageParams,
  WorkParams,
  WorkReviewFeedback,
  WorkSearchPage,
  WorkSearchPageParams,
  WorkSummary,
} from "./works";

export const RPC_CHANNEL = "glaze:rpc";
export const EVENT_CHANNEL = "glaze:event";

export type RpcError = { kind: string; message: string };
export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError };

export interface WindowState {
  maximized: boolean;
}

export interface RpcMethods {
  "mcp.snapshot": { params: undefined; result: McpSnapshot };
  "mcp.resolveOperation": { params: { operationId: string }; result: undefined };
  "mcp.setEnabled": { params: { enabled: boolean }; result: McpSnapshot };
  "mcp.invite": { params: { name: string }; result: McpInvitation };
  "mcp.grant": { params: { clientId: string; grant: McpGrant }; result: McpSnapshot };
  "mcp.disconnect": { params: { clientId: string }; result: undefined };
  "mcp.revoke": { params: { clientId: string }; result: undefined };
  "mcp.directory": { params: { clientId: string; removeId?: string }; result: undefined };
  "mcp.decide": { params: { operationId: string; revision: number; approve: boolean }; result: undefined };
  "mcp.editDraft": { params: { draftId: string; revision: number; patch: WorkRecord }; result: McpDraft };
  "promotion.activities": { params: PromotionPageParams; result: { records: PromotionActivity[]; total: number } };
  "promotion.discount": { params: AccountParams | undefined; result: { activity: PromotionActivity | null } };
  "promotion.module": { params: PromotionModuleParams; result: PromotionModuleData };
  "promotion.dates": { params: AccountParams | undefined; result: PromotionDates };
  "promotion.applications": { params: PromotionPageParams; result: { records: BannerApplication[]; total: number } };
  "promotion.join": { params: PromotionJoinParams; result: undefined };
  "promotion.cancelDiscount": { params: { account: string; activityId: string; itemId: string }; result: undefined };
  "promotion.saveBanner": { params: BannerSaveParams; result: undefined };
  "promotion.upload": { params: { account: string; kind: "image" | "video" | "banner" }; result: WorkUpload | null };
  "promotion.prepareImage": { params: { account: string }; result: WorkImageDraft | null };
  "promotion.uploadImage": { params: WorkCropParams; result: WorkUpload };
  "promotion.discardImage": { params: { account: string; token: string }; result: undefined };
  "sessionSettings.get": { params: undefined; result: SessionSettings };
  "sessionSettings.set": { params: SessionSettings; result: SessionSettings };
  "app.reportRendererError": { params: { kind: "error" | "unhandled-rejection" }; result: undefined };
  "plugins.list": { params: undefined; result: PluginSnapshot };
  "plugins.setEnabled": { params: { id: string; enabled: boolean }; result: PluginSnapshot };
  "plugins.pickInstall": { params: undefined; result: PluginInstallPreview | null };
  "plugins.install": { params: { token: string }; result: PluginSnapshot };
  "logs.list": { params: LogQuery; result: LogPage };
  "logs.export": { params: LogQuery; result: { cancelled: boolean; count: number } };
  "logs.clear": { params: undefined; result: undefined };
  "logs.openFolder": { params: undefined; result: undefined };
  "general.get": { params: undefined; result: GeneralState };
  "general.set": { params: GeneralSettings; result: GeneralState };
  "general.clearCache": { params: undefined; result: CacheClearResult };
  "app.rememberRoute": { params: { route: string }; result: undefined };
  "appearance.get": { params: undefined; result: AppearanceSettings };
  "appearance.set": { params: AppearanceSettings; result: AppearanceSettings };
  "layout.getRanking": { params: undefined; result: RankBoard[] };
  "layout.setRanking": { params: RankBoard[]; result: RankBoard[] };
  "layout.reset": { params: undefined; result: RankBoard[] };
  "feedback.list": { params: FeedbackListParams; result: FeedbackPageData };
  "feedback.reply": { params: FeedbackReplyParams; result: undefined };
  "feedback.log": { params: { url: string }; result: string };
  "messages.list": { params: MessageListParams; result: MessagePage };
  "messages.unreadCount": { params: AccountParams | undefined; result: number };
  "messages.get": { params: MessageParams; result: MessageContent };
  "messages.markAllRead": { params: { account: string }; result: undefined };
  "messages.delete": { params: MessageDeleteParams; result: undefined };
  "comments.list": { params: CommentListParams; result: CommentPage };
  "comments.reply": { params: CommentReplyParams; result: undefined };
  "window.minimize": { params: undefined; result: undefined };
  "window.toggleMaximize": { params: undefined; result: undefined };
  "window.close": { params: undefined; result: undefined };
  "window.getState": { params: undefined; result: WindowState };
  "app.getInitialRoute": { params: undefined; result: InitialRoute };
  "account.list": { params: undefined; result: AccountSummary[] };
  "account.current": { params: undefined; result: AccountSummary | null };
  "account.loginWithWindow": { params: undefined; result: AccountSummary };
  "account.cancelLogin": { params: undefined; result: undefined };
  "account.loginWithCookie": { params: { cookie: string }; result: AccountSummary };
  "account.verify": { params: undefined; result: AccountSummary };
  "account.switch": { params: { id: string }; result: AccountSummary };
  "account.logout": { params: undefined; result: undefined };
  "account.remove": { params: { id: string }; result: undefined };
  "developer.level": { params: AccountParams | undefined; result: DeveloperLevel };
  "analytics.overview": { params: AccountParams | undefined; result: AnalyticsOverview };
  "analytics.daily": { params: AnalyticsDailyParams; result: AnalyticsRecord[] };
  "analytics.periodIncome": { params: AnalyticsPeriodIncomeParams; result: AnalyticsPeriodIncome };
  "analytics.monthly": { params: AnalyticsRangeParams; result: AnalyticsRecord[] };
  "analytics.realtime": { params: AnalyticsRealtimeParams; result: AnalyticsRealtime };
  "income.estimate": { params: IncomeEstimateParams | undefined; result: IncomeEstimate };
  "income.list": { params: IncomeListParams; result: IncomeList };
  "income.detail": { params: IncomeDetailParams; result: IncomeDetail };
  "rank.list": { params: RankListParams; result: RankEntry[] };
  "rank.page": { params: RankPageParams; result: RankPage };
  "works.list": { params: (AccountParams & { platform?: IncomePlatform }) | undefined; result: WorkSummary[] };
  "works.page": { params: WorkPageParams; result: WorkPage };
  "works.search": { params: WorkSearchPageParams; result: WorkSearchPage };
  "works.create": { params: WorkCreateParams; result: undefined };
  "works.searchReferences": { params: WorkSearchParams; result: WorkReference[] };
  "works.prepareImage": { params: WorkImageParams; result: WorkImageDraft | null };
  "works.uploadCroppedImage": { params: WorkCropParams; result: WorkUpload };
  "works.discardImage": { params: { account: string; token: string }; result: undefined };
  "works.cancelReview": { params: WorkOperationParams; result: WorkOperationResult };
  "works.publish": { params: WorkOperationParams; result: WorkOperationResult };
  "works.appointOnline": { params: WorkOperationParams; result: WorkOperationResult };
  "works.cancelAppointOnline": { params: WorkOperationParams; result: WorkOperationResult };
  "works.submitSelfTest": { params: WorkOperationParams; result: WorkOperationResult };
  "works.cancelTest": { params: WorkOperationParams; result: WorkOperationResult };
  "works.delete": { params: WorkOperationParams; result: WorkOperationResult };
  "works.changePrice": { params: WorkOperationParams; result: WorkOperationResult };
  "works.get": { params: WorkParams; result: WorkDetail };
  "works.reviewFeedback": { params: WorkParams; result: WorkReviewFeedback | null };
  "works.editor": { params: WorkParams; result: WorkEditorDocument };
  "works.options": { params: AccountParams | undefined; result: WorkEditorOptions };
  "works.save": { params: WorkSaveParams; result: undefined };
  "works.submitReview": { params: WorkParams; result: WorkReviewResult };
  "works.upload": { params: WorkUploadParams; result: WorkUpload | null };
  "works.uploadDroppedResource": { params: WorkResourceUploadParams; result: WorkUpload };
}

export interface EventPayloads {
  "mcp.changed": { pendingCount: number };
  "sessionSettings.changed": SessionSettings;
  "plugins.changed": PluginSnapshot;
  "logs.changed": undefined;
  "general.changed": GeneralState;
  "cache.cleared": undefined;
  "appearance.changed": AppearanceSettings;
  "layout.rankingChanged": RankBoard[];
  "window.stateChanged": WindowState;
  "account.changed": AccountChanged;
  "login.progress": { step: LoginStep };
}

export type RpcMethod = keyof RpcMethods;
export type EventName = keyof EventPayloads;

export interface RpcRequest {
  method: string;
  params: unknown;
}

export interface EventMessage {
  event: string;
  payload: unknown;
}

/** API exposed to the renderer as window.glaze */
export interface GlazeBridge {
  uploadDroppedResource?(file: File, params: WorkResourceUploadParams): Promise<RpcResult<WorkUpload>>;
  rpc<M extends RpcMethod>(method: M, params?: RpcMethods[M]["params"]): Promise<RpcResult<RpcMethods[M]["result"]>>;
  on<E extends EventName>(event: E, listener: (payload: EventPayloads[E]) => void): () => void;
}
