import {
  EVENT_CHANNEL,
  type EventMessage,
  type EventName,
  type EventPayloads,
  isCommentListParams,
  isCommentReplyParams,
  isFeedbackListParams,
  isFeedbackReplyParams,
  isMessageId,
  isMessageIds,
  isMessageListParams,
  isWorkCreateParams,
  isWorkSaveParams,
  type RankBoard,
  type RankCategory,
  RPC_CHANNEL,
  type RpcMethod,
  type RpcMethods,
  type RpcResult,
} from "@glaze/contracts";
import {
  createWork,
  deleteMessages,
  estimateIncome,
  getAnalyticsOverview,
  getDeveloperLevel,
  getMessage,
  getMessageUnreadCount,
  getRankList,
  getReviewFeedback,
  getWork,
  getWorkEditorOptions,
  getWorksPage,
  listComments,
  listFeedback,
  listMessages,
  listWorks,
  markAllMessagesRead,
  monthOf,
  parseMonth,
  readFeedbackLog,
  readWorkEditor,
  replyComment,
  replyFeedback,
  saveWorkEditor,
  submitWorkReview,
} from "@glaze/netease";
import { BrowserWindow, type IpcMainInvokeEvent, ipcMain } from "electron";
import type { AppearanceService } from "../preferences/appearance";
import type { CacheService } from "../preferences/cache";
import type { GeneralService } from "../preferences/general";
import type { SessionManager } from "../session/session-manager";
import { closeLoginWindow, loginWithOfficialWindow } from "../windows/login-window";
import { appWindows } from "../windows/main-window";
import { CapabilityError, fromNeteaseError } from "./errors";
import { pickAndUploadWorkFile } from "./work-files";

type Handler<M extends RpcMethod> = (
  params: RpcMethods[M]["params"],
  event: IpcMainInvokeEvent,
) => RpcMethods[M]["result"] | Promise<RpcMethods[M]["result"]>;

type HandlerTable = { [M in RpcMethod]: Handler<M> };

/** Resolve the window that sent an RPC request */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

/** A non-empty string parameter; the renderer is not trusted to send well-formed params */
function requireString(params: unknown, key: string): string {
  const value = (params as Record<string, unknown> | null | undefined)?.[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new CapabilityError("internal", `参数 ${key} 无效`);
  }
  return value;
}

/** An optional string parameter; absent and undefined are both allowed */
function optionalString(params: unknown, key: string): string | undefined {
  const value = (params as Record<string, unknown> | null | undefined)?.[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new CapabilityError("internal", `参数 ${key} 无效`);
  }
  return value;
}

/** An optional string parameter restricted to known values */
function optionalOneOf<T extends string>(params: unknown, key: string, allowed: readonly T[]): T | undefined {
  const value = optionalString(params, key);
  if (value !== undefined && !(allowed as readonly string[]).includes(value)) {
    throw new CapabilityError("internal", `参数 ${key} 无效`);
  }
  return value as T | undefined;
}

/** An optional integer parameter within [min, max] */
function optionalInteger(params: unknown, key: string, min: number, max: number): number | undefined {
  const value = (params as Record<string, unknown> | null | undefined)?.[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new CapabilityError("internal", `参数 ${key} 应为 ${min} 到 ${max} 的整数`);
  }
  return value;
}

/** A work id; the platform uses long decimal ids, and only digits may reach the request path */
function requireItemId(params: unknown): string {
  const itemId = requireString(params, "itemId");
  if (!/^\d{1,32}$/.test(itemId)) {
    throw new CapabilityError("internal", "参数 itemId 无效");
  }
  return itemId;
}

const rankBoards: readonly RankBoard[] = ["pe_hot", "hot_search", "pe_download", "pe_sell", "pc_download", "pc_like"];
const rankCategories: readonly RankCategory[] = ["mod", "map", "texture", "lobby"];

/** Handlers for every RPC method, backed by the session manager */
function createHandlers(
  sessions: SessionManager,
  appearance: AppearanceService,
  general: GeneralService,
  cache: CacheService,
): HandlerTable {
  /** Pin mailbox writes and detail reads to the account that initiated them */
  const messageAccount = (params: unknown): string => {
    const account = requireString(params, "account");
    if (sessions.current()?.id !== account) throw new CapabilityError("account_changed", "账号已切换，请刷新消息中心");
    return account;
  };
  return {
    "general.get": () => general.get(),
    "general.set": (params) => {
      const saved = general.set(params);
      for (const win of appWindows()) sendEvent(win, "general.changed", saved);
      return saved;
    },
    "general.clearCache": () => cache.clear(),
    "app.rememberRoute": (params) => {
      const current = sessions.current();
      if (current && current.status !== "expired") general.rememberRoute(requireString(params, "route"));
      return undefined;
    },
    "appearance.get": () => appearance.get(),
    "appearance.set": (params) => {
      const saved = appearance.set(params);
      for (const win of appWindows()) sendEvent(win, "appearance.changed", saved);
      return saved;
    },
    "layout.getRanking": () => appearance.getRanking(),
    "layout.setRanking": (params) => {
      const saved = appearance.setRanking(params);
      for (const win of appWindows()) sendEvent(win, "layout.rankingChanged", saved);
      return saved;
    },
    "layout.reset": () => {
      const saved = appearance.resetLayouts();
      for (const win of appWindows()) sendEvent(win, "layout.rankingChanged", saved);
      return saved;
    },
    "messages.list": (params) => {
      if (!isMessageListParams(params)) throw new CapabilityError("validation", "消息筛选参数无效");
      return sessions.request(optionalString(params, "account"), (session) => listMessages(session, params));
    },
    "messages.unreadCount": (params) => sessions.request(optionalString(params, "account"), getMessageUnreadCount),
    "messages.get": (params) => {
      const account = messageAccount(params);
      if (!isMessageId(params.id)) throw new CapabilityError("validation", "消息 ID 无效");
      return sessions.request(account, (session) => getMessage(session, params.id));
    },
    "messages.markAllRead": (params) => sessions.request(messageAccount(params), markAllMessagesRead),
    "messages.delete": (params) => {
      const account = messageAccount(params);
      if (!isMessageIds(params.ids)) throw new CapabilityError("validation", "待删除的消息列表无效");
      return sessions.request(account, (session) => deleteMessages(session, params.ids));
    },
    "comments.list": (params) => {
      if (!isCommentListParams(params)) throw new CapabilityError("validation", "评论查询参数无效");
      return sessions.request(params.account, (session) => listComments(session, params));
    },
    "comments.reply": (params) => {
      if (!isCommentReplyParams(params)) throw new CapabilityError("validation", "评论回复参数无效，回复须为 1–100 字");
      if (sessions.current()?.id !== params.account)
        throw new CapabilityError("account_changed", "账号已切换，请重新选择评论");
      return sessions.request(params.account, (session) => replyComment(session, params));
    },
    "feedback.list": (params) => {
      if (!isFeedbackListParams(params)) throw new CapabilityError("validation", "反馈查询参数无效");
      return sessions.request(params.account, (session) => listFeedback(session, params));
    },
    "feedback.reply": (params) => {
      if (!isFeedbackReplyParams(params)) throw new CapabilityError("validation", "反馈回复参数无效");
      if (sessions.current()?.id !== params.account)
        throw new CapabilityError("account_changed", "账号已切换，请重新选择反馈");
      return sessions.request(params.account, (session) => replyFeedback(session, params));
    },
    "feedback.log": async (params) => {
      const result = await readFeedbackLog(requireString(params, "url"));
      if (!result.ok) throw fromNeteaseError(result.error);
      return result.value;
    },
    "works.create": (params) => {
      if (!isWorkCreateParams(params)) throw new CapabilityError("validation", "新建作品参数无效");
      if (sessions.current()?.id !== params.account)
        throw new CapabilityError("account_changed", "账号已切换，请重新打开新建页面");
      return sessions.request(params.account, (session) => createWork(session, params));
    },
    "works.editor": (params) => {
      const itemId = requireItemId(params);
      return sessions.request(optionalString(params, "account"), (session) => readWorkEditor(session, itemId));
    },
    "works.options": (params) => sessions.request(optionalString(params, "account"), getWorkEditorOptions),
    "works.save": (params) => {
      if (!isWorkSaveParams(params)) throw new CapabilityError("validation", "作品保存参数无效");
      const account = requireString(params, "account");
      if (sessions.current()?.id !== account)
        throw new CapabilityError("account_changed", "账号已切换，请重新打开作品");
      return sessions.request(account, (session) => saveWorkEditor(session, params));
    },
    "works.submitReview": (params) => {
      const itemId = requireItemId(params);
      const account = requireString(params, "account");
      if (sessions.current()?.id !== account)
        throw new CapabilityError("account_changed", "账号已切换，请重新打开作品");
      return sessions.request(account, (session) => submitWorkReview(session, itemId));
    },
    "works.upload": (params, event) => {
      const itemId = optionalString(params, "itemId") === undefined ? undefined : requireItemId(params);
      const account = requireString(params, "account");
      const kind = optionalOneOf(params, "kind", [
        "resource",
        "image",
        "banner",
        "video",
        "videoCover",
        "richImage",
      ] as const);
      const platform = optionalOneOf(params, "platform", ["pe", "pc"] as const) ?? "pe";
      const channelId = optionalInteger(params, "channelId", 0, 10000);
      const window = senderWindow(event);
      if (!kind || !window || (kind === "image" && channelId === undefined))
        throw new CapabilityError("validation", "上传参数无效");
      return pickAndUploadWorkFile(sessions, window, {
        ...(itemId === undefined ? {} : { itemId }),
        account,
        kind,
        platform,
        ...(channelId === undefined ? {} : { channelId }),
      });
    },
    "window.minimize": (_params, event) => {
      senderWindow(event)?.minimize();
      return undefined;
    },
    "window.toggleMaximize": (_params, event) => {
      const win = senderWindow(event);
      if (win?.isMaximized()) {
        win.unmaximize();
      } else {
        win?.maximize();
      }
      return undefined;
    },
    "window.close": (_params, event) => {
      senderWindow(event)?.close();
      return undefined;
    },
    "window.getState": (_params, event) => ({ maximized: senderWindow(event)?.isMaximized() ?? false }),
    "app.getInitialRoute": () => general.initialRoute(sessions.initialRoute()),
    "account.list": () => sessions.list(),
    "account.current": () => sessions.current(),
    "account.loginWithWindow": (_params, event) =>
      sessions.loginWithWindow(() => loginWithOfficialWindow(senderWindow(event))),
    "account.cancelLogin": () => {
      closeLoginWindow();
      return undefined;
    },
    "account.loginWithCookie": (params) => sessions.loginWithCookie(requireString(params, "cookie")),
    "account.verify": () => sessions.verify(),
    "account.switch": (params) => sessions.switchTo(requireString(params, "id")),
    "account.logout": () => {
      sessions.logout();
      return undefined;
    },
    "account.remove": (params) => {
      sessions.remove(requireString(params, "id"));
      return undefined;
    },
    "developer.level": (params) => sessions.request(optionalString(params, "account"), getDeveloperLevel),
    "analytics.overview": (params) => sessions.request(optionalString(params, "account"), getAnalyticsOverview),
    "income.estimate": (params) => {
      const month = optionalString(params, "month") ?? monthOf(new Date());
      if (!parseMonth(month)) {
        throw new CapabilityError("internal", "参数 month 应为 YYYY-MM");
      }
      return sessions.request(optionalString(params, "account"), (session) => estimateIncome(session, month));
    },
    "rank.list": (params) => {
      const board = optionalOneOf(params, "board", rankBoards);
      if (!board) {
        throw new CapabilityError("internal", "参数 board 无效");
      }
      const category = optionalOneOf(params, "category", rankCategories) ?? "mod";
      const limit = optionalInteger(params, "limit", 1, 50) ?? 10;
      return sessions.request(optionalString(params, "account"), (session) =>
        getRankList(session, board, category, limit),
      );
    },
    "works.list": (params) => sessions.request(optionalString(params, "account"), listWorks),
    "works.page": (params) => {
      const page = optionalInteger(params, "page", 0, 100_000_000);
      const pageSize = optionalInteger(params, "pageSize", 1, 50);
      if (page === undefined || pageSize === undefined) throw new CapabilityError("validation", "作品分页参数无效");
      return sessions.request(optionalString(params, "account"), (session) => getWorksPage(session, page, pageSize));
    },
    "works.get": (params) => {
      const itemId = requireItemId(params);
      return sessions.request(optionalString(params, "account"), (session) => getWork(session, itemId));
    },
    "works.reviewFeedback": (params) => {
      const itemId = requireItemId(params);
      return sessions.request(optionalString(params, "account"), (session) => getReviewFeedback(session, itemId));
    },
  };
}

/** Register the single glaze:rpc channel; every call returns a RpcResult instead of throwing */
export function registerRpc(
  sessions: SessionManager,
  appearance: AppearanceService,
  general: GeneralService,
  cache: CacheService,
): void {
  const handlers = createHandlers(sessions, appearance, general, cache);
  const isRpcMethod = (method: unknown): method is RpcMethod =>
    typeof method === "string" && Object.hasOwn(handlers, method);

  ipcMain.handle(RPC_CHANNEL, async (event, request: unknown): Promise<RpcResult<unknown>> => {
    const method = (request as { method?: unknown } | null)?.method;
    if (!isRpcMethod(method)) {
      return { ok: false, error: { kind: "unknown-method", message: `Unknown RPC method: ${String(method)}` } };
    }
    try {
      if (
        (method.startsWith("general.") ||
          method === "app.rememberRoute" ||
          method.startsWith("appearance.") ||
          method.startsWith("layout.") ||
          method.startsWith("works.") ||
          method.startsWith("messages.") ||
          method.startsWith("feedback.") ||
          method.startsWith("comments.")) &&
        (!appWindows().some((window) => window.webContents === event.sender) ||
          event.senderFrame !== event.sender.mainFrame)
      ) {
        throw new CapabilityError("internal", "业务接口只允许主界面调用");
      }
      const handler = handlers[method] as Handler<RpcMethod>;
      const value = await handler((request as { params?: unknown }).params as undefined, event);
      return { ok: true, value };
    } catch (error) {
      if (error instanceof CapabilityError) {
        return { ok: false, error: { kind: error.kind, message: error.message } };
      }
      return {
        ok: false,
        error: { kind: "internal", message: error instanceof Error ? error.message : String(error) },
      };
    }
  });
}

/** Push an event to one window over glaze:event */
export function sendEvent<E extends EventName>(win: BrowserWindow, event: E, payload: EventPayloads[E]): void {
  const message: EventMessage = { event, payload };
  win.webContents.send(EVENT_CHANNEL, message);
}
