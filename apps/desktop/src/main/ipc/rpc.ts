import {
  EVENT_CHANNEL,
  type EventMessage,
  type EventName,
  type EventPayloads,
  RPC_CHANNEL,
  type RpcMethod,
  type RpcMethods,
  type RpcResult,
} from "@glaze/contracts";
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
