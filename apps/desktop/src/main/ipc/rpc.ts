import {
  EVENT_CHANNEL,
  type EventMessage,
  type EventName,
  type EventPayloads,
  type RankBoard,
  type RankCategory,
  RPC_CHANNEL,
  type RpcMethod,
  type RpcMethods,
  type RpcResult,
} from "@glaze/contracts";
import {
  estimateIncome,
  getAnalyticsOverview,
  getDeveloperLevel,
  getRankList,
  getReviewFeedback,
  getWork,
  listWorks,
  monthOf,
  parseMonth,
} from "@glaze/netease";
import { BrowserWindow, type IpcMainInvokeEvent, ipcMain } from "electron";
import type { SessionManager } from "../session/session-manager";
import { closeLoginWindow, loginWithOfficialWindow } from "../windows/login-window";
import { CapabilityError } from "./errors";

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
function createHandlers(sessions: SessionManager): HandlerTable {
  return {
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
    "app.getInitialRoute": () => sessions.initialRoute(),
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
export function registerRpc(sessions: SessionManager): void {
  const handlers = createHandlers(sessions);
  const isRpcMethod = (method: unknown): method is RpcMethod =>
    typeof method === "string" && Object.hasOwn(handlers, method);

  ipcMain.handle(RPC_CHANNEL, async (event, request: unknown): Promise<RpcResult<unknown>> => {
    const method = (request as { method?: unknown } | null)?.method;
    if (!isRpcMethod(method)) {
      return { ok: false, error: { kind: "unknown-method", message: `Unknown RPC method: ${String(method)}` } };
    }
    try {
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
