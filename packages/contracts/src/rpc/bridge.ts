// Temporary hand-written contracts; replaced by Zod schemas in M1
import type { AccountChanged, AccountSummary, InitialRoute, LoginStep } from "./account";
import type { AccountParams, AnalyticsOverview, DeveloperLevel } from "./developer";
import type { IncomeEstimate, IncomeEstimateParams } from "./income";
import type { MessageContent, MessageDeleteParams, MessageListParams, MessagePage, MessageParams } from "./messages";
import type { RankEntry, RankListParams } from "./rank";
import type { WorkCreateParams } from "./work-create";
import type {
  WorkEditorDocument,
  WorkEditorOptions,
  WorkReviewResult,
  WorkSaveParams,
  WorkUpload,
  WorkUploadParams,
} from "./work-editor";
import type { WorkDetail, WorkParams, WorkReviewFeedback, WorkSummary } from "./works";

export const RPC_CHANNEL = "glaze:rpc";
export const EVENT_CHANNEL = "glaze:event";

export type RpcError = { kind: string; message: string };
export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError };

export interface WindowState {
  maximized: boolean;
}

export interface RpcMethods {
  "messages.list": { params: MessageListParams; result: MessagePage };
  "messages.unreadCount": { params: AccountParams | undefined; result: number };
  "messages.get": { params: MessageParams; result: MessageContent };
  "messages.markAllRead": { params: { account: string }; result: undefined };
  "messages.delete": { params: MessageDeleteParams; result: undefined };
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
  "income.estimate": { params: IncomeEstimateParams | undefined; result: IncomeEstimate };
  "rank.list": { params: RankListParams; result: RankEntry[] };
  "works.list": { params: AccountParams | undefined; result: WorkSummary[] };
  "works.create": { params: WorkCreateParams; result: undefined };
  "works.get": { params: WorkParams; result: WorkDetail };
  "works.reviewFeedback": { params: WorkParams; result: WorkReviewFeedback | null };
  "works.editor": { params: WorkParams; result: WorkEditorDocument };
  "works.options": { params: AccountParams | undefined; result: WorkEditorOptions };
  "works.save": { params: WorkSaveParams; result: undefined };
  "works.submitReview": { params: WorkParams; result: WorkReviewResult };
  "works.upload": { params: WorkUploadParams; result: WorkUpload | null };
}

export interface EventPayloads {
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
  rpc<M extends RpcMethod>(method: M, params?: RpcMethods[M]["params"]): Promise<RpcResult<RpcMethods[M]["result"]>>;
  on<E extends EventName>(event: E, listener: (payload: EventPayloads[E]) => void): () => void;
}
