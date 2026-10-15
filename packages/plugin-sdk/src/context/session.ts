import type {
  AccountSummary,
  EventName,
  EventPayloads,
  GlazeBridge,
  RpcMethod,
  RpcMethods,
  RpcResult,
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

/** Call a host capability; failures come back as { ok: false, error } and never throw */
export function callHost<M extends RpcMethod>(
  method: M,
  params?: RpcMethods[M]["params"],
): Promise<RpcResult<RpcMethods[M]["result"]>> {
  return bridge().rpc(method, params);
}

/** Subscribe to a host event; returns the unsubscribe function */
export function onHostEvent<E extends EventName>(event: E, listener: (payload: EventPayloads[E]) => void): () => void {
  return bridge().on(event, listener);
}
