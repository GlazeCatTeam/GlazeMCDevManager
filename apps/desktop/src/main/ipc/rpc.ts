import {
  EVENT_CHANNEL,
  type EventMessage,
  type EventName,
  type EventPayloads,
  isAnalyticsDate,
  isAnalyticsRange,
  isAnalyticsResourceIds,
  isCommentListParams,
  isCommentReplyParams,
  isFeedbackListParams,
  isFeedbackReplyParams,
  isIncomeDetailParams,
  isIncomeListParams,
  isLogQuery,
  isMessageId,
  isMessageIds,
  isMessageListParams,
  isWorkCreateParams,
  isWorkSaveParams,
  isWorkSearchParams,
  type RankBoard,
  type RankCategory,
  RPC_CHANNEL,
  type RpcMethod,
  type RpcMethods,
  type RpcResult,
} from "@glaze/contracts";
import { McpError } from "@glaze/mcp";
import {
  createWork,
  deleteMessages,
  estimateIncome,
  getAnalyticsDaily,
  getAnalyticsMonthly,
  getAnalyticsOverview,
  getAnalyticsPeriodIncome,
  getAnalyticsRealtime,
  getDeveloperLevel,
  getIncomeDetail,
  getIncomeList,
  getMessage,
  getMessageUnreadCount,
  getRankIcons,
  getRankList,
  getRankPage,
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
  searchWorkReferences,
  searchWorks,
  submitWorkReview,
} from "@glaze/netease";
import { BrowserWindow, type IpcMainInvokeEvent, ipcMain } from "electron";
import type { LogService } from "../logs/service";
import type { McpHost } from "../mcp/host";
import type { PluginRegistry } from "../plugins/registry";
import type { AppearanceService } from "../preferences/appearance";
import type { CacheService } from "../preferences/cache";
import type { GeneralService } from "../preferences/general";
import type { SessionSettingsService } from "../preferences/session-settings";
import type { SessionManager } from "../session/session-manager";
import { closeLoginWindow, loginWithOfficialWindow } from "../windows/login-window";
import { appWindows } from "../windows/main-window";
import { getAboutInfo, getDependencyLicenses, openProjectLink, openRuntimeNotices } from "./about";
import { CapabilityError, fromNeteaseError } from "./errors";
import { createPromotionHandlers } from "./promotion";
import { exportLogs, openLogs, pickPlugin } from "./settings-files";
import { pickAndUploadWorkFile, uploadDroppedWorkResource } from "./work-files";
import { discardWorkImage, prepareWorkImage, uploadCroppedWorkImage } from "./work-image";
import { createWorkOperationHandlers } from "./work-operations";

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

const rankBoards: readonly RankBoard[] = ["pe_hot", "hot_search", "pe_download", "pe_sell"];
const rankCategories: readonly RankCategory[] = ["mod", "map", "texture", "lobby"];

/** Handlers for every RPC method, backed by the session manager */
function createHandlers(
  sessions: SessionManager,
  appearance: AppearanceService,
  general: GeneralService,
  cache: CacheService,
  plugins: PluginRegistry,
  logs: LogService,
  sessionSettings: SessionSettingsService,
  mcp: McpHost,
): HandlerTable {
  let lastRendererError = 0;
  /** Pin mailbox writes and detail reads to the account that initiated them */
  const messageAccount = (params: unknown): string => {
    const account = requireString(params, "account");
    if (sessions.current()?.id !== account) throw new CapabilityError("account_changed", "账号已切换，请刷新系统消息");
    return account;
  };
  return {
    ...mcp.handlers,
    "app.getAbout": () => getAboutInfo(),
    "app.getLicenses": () => getDependencyLicenses(),
    "app.openProjectLink": (params) => openProjectLink(params?.link),
    "app.openRuntimeNotices": () => openRuntimeNotices(),
    "sessionSettings.get": () => sessionSettings.get(),
    "sessionSettings.set": (params) => {
      const saved = sessionSettings.set(params);
      for (const win of appWindows()) sendEvent(win, "sessionSettings.changed", saved);
      return saved;
    },
    ...createWorkOperationHandlers(sessions),
    ...createPromotionHandlers(sessions),
    "app.reportRendererError": (params) => {
      if (!params || (params.kind !== "error" && params.kind !== "unhandled-rejection"))
        throw new CapabilityError("validation", "界面错误类型无效");
      if (Date.now() - lastRendererError > 5000) {
        lastRendererError = Date.now();
        logs.write("error", "renderer", params.kind === "error" ? "界面脚本发生错误" : "界面异步操作发生未处理异常");
      }
      return undefined;
    },
    "plugins.list": () => plugins.snapshot(),
    "plugins.setEnabled": (params) => plugins.setEnabled(params?.id, params?.enabled),
    "plugins.pickInstall": (_params, event) => {
      const window = senderWindow(event);
      if (!window) throw new Error("找不到应用窗口");
      return pickPlugin(window, plugins);
    },
    "plugins.install": (params) => plugins.install(params?.token),
    "logs.list": (params) => {
      if (!isLogQuery(params)) throw new CapabilityError("validation", "日志筛选参数无效");
      return logs.list(params);
    },
    "logs.export": (params, event) => {
      if (!isLogQuery(params)) throw new CapabilityError("validation", "日志筛选参数无效");
      const window = senderWindow(event);
      if (!window) throw new Error("找不到应用窗口");
      return exportLogs(window, logs, params);
    },
    "logs.clear": () => {
      logs.clear();
      return undefined;
    },
    "logs.openFolder": async () => {
      await openLogs(logs);
      return undefined;
    },
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
    "works.searchReferences": (params) => {
      if (!isWorkSearchParams(params)) throw new CapabilityError("validation", "模组搜索参数无效");
      return sessions.request(params.account, (session) => searchWorkReferences(session, params));
    },
    "works.prepareImage": (params, event) => {
      const window = senderWindow(event);
      const kind = optionalOneOf(params, "kind", ["image", "banner", "videoCover", "proof"] as const);
      const account = requireString(params, "account");
      const platform = optionalOneOf(params, "platform", ["pe", "pc"] as const) ?? "pe";
      const channelId = optionalInteger(params, "channelId", 0, 10000);
      if (!window || !kind || (kind === "image" && channelId === undefined))
        throw new CapabilityError("validation", "图片选择参数无效");
      return prepareWorkImage(sessions, window, {
        account,
        kind,
        platform,
        ...(channelId === undefined ? {} : { channelId }),
      });
    },
    "works.uploadCroppedImage": (params, event) => {
      const window = senderWindow(event);
      if (!window) throw new CapabilityError("validation", "窗口已关闭");
      requireString(params, "account");
      requireString(params, "token");
      return uploadCroppedWorkImage(sessions, window, params);
    },
    "works.discardImage": (params, event) => {
      const window = senderWindow(event);
      if (window) discardWorkImage(requireString(params, "account"), requireString(params, "token"), window);
      return undefined;
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
        "proof",
      ] as const);
      const platform = optionalOneOf(params, "platform", ["pe", "pc"] as const) ?? "pe";
      const channelId = optionalInteger(params, "channelId", 0, 10000);
      const resourceType = optionalInteger(params, "resourceType", 1, 10000);
      const window = senderWindow(event);
      if (!kind || !window || (kind === "image" && channelId === undefined))
        throw new CapabilityError("validation", "上传参数无效");
      return pickAndUploadWorkFile(sessions, window, {
        ...(itemId === undefined ? {} : { itemId }),
        account,
        kind,
        platform,
        ...(channelId === undefined ? {} : { channelId }),
        ...(resourceType === undefined ? {} : { resourceType }),
      });
    },
    "works.uploadDroppedResource": (params, event) => {
      const window = senderWindow(event);
      const account = requireString(params, "account");
      const resourceType = optionalInteger(params, "resourceType", 1, 10000);
      const itemId = optionalString(params, "itemId") === undefined ? undefined : requireItemId(params);
      if (!window || resourceType === undefined) throw new CapabilityError("validation", "拖入资源参数无效");
      return uploadDroppedWorkResource(
        sessions,
        window,
        { account, resourceType, ...(itemId === undefined ? {} : { itemId }) },
        requireString(params, "nativePath"),
      );
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
    "app.getInitialRoute": () => {
      const route = general.initialRoute(sessions.initialRoute());
      const owner = route.route.split("/")[0];
      return plugins.snapshot().plugins.find((item) => item.id === owner)?.enabled
        ? route
        : { route: "glaze.home/home", params: {} };
    },
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
    "analytics.daily": (params) => {
      if (
        !isAnalyticsRange(params) ||
        !isAnalyticsResourceIds(params.resourceIds) ||
        (params.includePeers !== undefined && typeof params.includePeers !== "boolean")
      )
        throw new CapabilityError("internal", "分析日期或资源参数无效");
      return sessions.request(optionalString(params, "account"), (session) => getAnalyticsDaily(session, params));
    },
    "analytics.periodIncome": (params) => {
      if (!isAnalyticsRange(params) || !isAnalyticsResourceIds(params.resourceIds))
        throw new CapabilityError("internal", "周期收益日期或资源参数无效");
      return sessions.request(optionalString(params, "account"), (session) =>
        getAnalyticsPeriodIncome(session, params),
      );
    },
    "analytics.monthly": (params) => {
      if (!isAnalyticsRange(params)) throw new CapabilityError("internal", "分析日期范围无效");
      return sessions.request(optionalString(params, "account"), (session) => getAnalyticsMonthly(session, params));
    },
    "analytics.realtime": (params) => {
      if (!params || !isAnalyticsDate(params.date) || !isAnalyticsResourceIds(params.resourceIds))
        throw new CapabilityError("internal", "实时收益日期或资源参数无效");
      return sessions.request(optionalString(params, "account"), (session) => getAnalyticsRealtime(session, params));
    },
    "income.list": (params) => {
      if (!isIncomeListParams(params)) throw new CapabilityError("internal", "收益平台参数无效");
      return sessions.request(optionalString(params, "account"), (session) => getIncomeList(session, params));
    },
    "income.detail": (params) => {
      if (!isIncomeDetailParams(params)) throw new CapabilityError("internal", "收益记录参数无效");
      return sessions.request(optionalString(params, "account"), (session) => getIncomeDetail(session, params));
    },
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
    "rank.page": (params) => {
      const board = optionalOneOf(params, "board", rankBoards);
      if (!board) throw new CapabilityError("internal", "参数 board 无效");
      const category = optionalOneOf(params, "category", rankCategories) ?? "mod";
      const start = optionalInteger(params, "start", 0, 1_000_000) ?? 0;
      const limit = optionalInteger(params, "limit", 1, 50) ?? 50;
      if (params.includeIcons !== undefined && typeof params.includeIcons !== "boolean")
        throw new CapabilityError("validation", "参数 includeIcons 无效");
      return sessions.request(optionalString(params, "account"), (session) =>
        getRankPage(session, board, category, start, limit, params.includeIcons !== false),
      );
    },
    "rank.icons": async (params) => {
      if (
        !Array.isArray(params.itemIds) ||
        params.itemIds.length > 50 ||
        params.itemIds.some((id) => typeof id !== "string" || !/^\d{1,32}$/.test(id))
      )
        throw new CapabilityError("validation", "封面查询需要最多 50 个数字作品 ID");
      return Object.fromEntries(await getRankIcons(params.itemIds));
    },
    "works.list": (params) => {
      const platform = optionalOneOf(params, "platform", ["pe", "pc"] as const) ?? "pe";
      return sessions.request(optionalString(params, "account"), (session) => listWorks(session, platform));
    },
    "works.page": (params) => {
      const page = optionalInteger(params, "page", 0, 100_000_000);
      const pageSize = optionalInteger(params, "pageSize", 1, 50);
      if (page === undefined || pageSize === undefined) throw new CapabilityError("validation", "作品分页参数无效");
      return sessions.request(optionalString(params, "account"), (session) => getWorksPage(session, page, pageSize));
    },
    "works.search": (params) => {
      const query = requireString(params, "query");
      const kind = optionalOneOf(params, "kind", ["name", "id"] as const);
      const page = optionalInteger(params, "page", 0, 100_000_000);
      const pageSize = optionalInteger(params, "pageSize", 1, 50);
      if (!kind || page === undefined || pageSize === undefined)
        throw new CapabilityError("validation", "作品搜索参数无效");
      const account = requireString(params, "account");
      return sessions.request(account, (session) => searchWorks(session, { account, query, kind, page, pageSize }));
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
  plugins: PluginRegistry,
  logs: LogService,
  sessionSettings: SessionSettingsService,
  mcp: McpHost,
): void {
  const handlers = createHandlers(sessions, appearance, general, cache, plugins, logs, sessionSettings, mcp);
  const isRpcMethod = (method: unknown): method is RpcMethod =>
    typeof method === "string" && Object.hasOwn(handlers, method);

  ipcMain.handle(RPC_CHANNEL, async (event, request: unknown): Promise<RpcResult<unknown>> => {
    const method = (request as { method?: unknown } | null)?.method;
    if (!isRpcMethod(method)) {
      return { ok: false, error: { kind: "unknown-method", message: `Unknown RPC method: ${String(method)}` } };
    }
    try {
      if (
        (method.startsWith("mcp.") ||
          method.startsWith("plugins.") ||
          method.startsWith("sessionSettings.") ||
          method.startsWith("logs.") ||
          method.startsWith("general.") ||
          method === "app.rememberRoute" ||
          method === "app.reportRendererError" ||
          method === "app.getAbout" ||
          method === "app.getLicenses" ||
          method === "app.openProjectLink" ||
          method === "app.openRuntimeNotices" ||
          method.startsWith("appearance.") ||
          method.startsWith("layout.") ||
          method.startsWith("works.") ||
          method.startsWith("promotion.") ||
          method.startsWith("messages.") ||
          method.startsWith("feedback.") ||
          method.startsWith("comments.")) &&
        (!appWindows().some((window) => window.webContents === event.sender) ||
          event.senderFrame !== event.sender.mainFrame)
      ) {
        throw new CapabilityError("internal", "业务接口只允许主界面调用");
      }
      const handler = handlers[method] as Handler<RpcMethod>;
      plugins.assertMethodEnabled(method);
      const value = await handler((request as { params?: unknown }).params as undefined, event);
      if (
        [
          "appearance.set",
          "general.set",
          "sessionSettings.set",
          "general.clearCache",
          "layout.reset",
          "works.save",
          "works.create",
          "works.submitReview",
          "works.cancelReview",
          "works.publish",
          "works.appointOnline",
          "works.cancelAppointOnline",
          "works.submitSelfTest",
          "works.cancelTest",
          "works.delete",
          "works.changePrice",
          "comments.reply",
          "feedback.reply",
          "promotion.join",
          "promotion.cancelDiscount",
          "promotion.saveBanner",
        ].includes(method)
      )
        logs.write(
          "info",
          "rpc",
          value && typeof value === "object" && "outcome" in value && value.outcome === "uncertain"
            ? `操作结果待核对：${method}`
            : `操作完成：${method}`,
        );
      return { ok: true, value };
    } catch (error) {
      // Never record request parameters, remote response bodies or exception text containing credentials
      if (!method.startsWith("logs.")) logs.write("error", "rpc", `操作失败：${method}`);
      if (error instanceof CapabilityError || error instanceof McpError) {
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
  if (win.isDestroyed() || win.webContents.isDestroyed()) return;
  const message: EventMessage = { event, payload };
  win.webContents.send(EVENT_CHANNEL, message);
}
