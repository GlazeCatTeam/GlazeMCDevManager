import {
  type AccountSummary,
  capabilities,
  type EventName,
  type EventPayloads,
  type GlazeBridge,
  type RpcMethod,
  type RpcMethods,
  type RpcResult,
} from "@glaze/contracts";
import { createContext, useContext } from "react";

export interface Session {
  /** Account every module currently uses; null before anyone has logged in */
  current: AccountSummary | null;
  accounts: AccountSummary[];
}

const SessionContext = createContext<Session | null>(null);

/** Provided by the shell, kept in sync with the main process's account.changed events */
export const SessionProvider = SessionContext.Provider;

/** Current account and the saved account list; never contains credentials */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useSession must be used inside the shell's SessionProvider");
  }
  return session;
}

/** The preload bridge; only exists inside the app window */
function bridge(): GlazeBridge {
  const glaze = (globalThis as { glaze?: GlazeBridge }).glaze;
  if (!glaze) {
    throw new Error("The host bridge is unavailable outside the app window");
  }
  return glaze;
}

const writeListeners = new Set<(method: RpcMethod) => void>();

/** Run a listener after every successful write capability, e.g. to refresh cached reads */
export function onHostWrite(listener: (method: RpcMethod) => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

/** Call a host capability; failures come back as { ok: false, error } and never throw */
export function callHost<M extends RpcMethod>(
  method: M,
  params?: RpcMethods[M]["params"],
): Promise<RpcResult<RpcMethods[M]["result"]>> {
  return bridge()
    .rpc(method, params)
    .then((result) => {
      if (result.ok && capabilities[method]?.risk !== "read") for (const notify of writeListeners) notify(method);
      return result;
    });
}

/** Subscribe to a host event; returns the unsubscribe function */
export function onHostEvent<E extends EventName>(event: E, listener: (payload: EventPayloads[E]) => void): () => void {
  return bridge().on(event, listener);
}
