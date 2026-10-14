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

type Handler<M extends RpcMethod> = (
  params: RpcMethods[M]["params"],
  event: IpcMainInvokeEvent,
) => RpcMethods[M]["result"] | Promise<RpcMethods[M]["result"]>;

type HandlerTable = { [M in RpcMethod]: Handler<M> };

/** Resolve the window that sent an RPC request */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

const handlers: HandlerTable = {
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
};

/** Check that a method name from the renderer is a known RPC method */
function isRpcMethod(method: unknown): method is RpcMethod {
  return typeof method === "string" && Object.hasOwn(handlers, method);
}

/** Register the single glaze:rpc channel; every call returns a RpcResult instead of throwing */
export function registerRpc(): void {
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
