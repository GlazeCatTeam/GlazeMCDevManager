// Temporary hand-written contracts; replaced by Zod schemas in M1

export const RPC_CHANNEL = "glaze:rpc";
export const EVENT_CHANNEL = "glaze:event";

export type RpcError = { kind: string; message: string };
export type RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError };

export interface WindowState {
  maximized: boolean;
}

export interface RpcMethods {
  "window.minimize": { params: undefined; result: undefined };
  "window.toggleMaximize": { params: undefined; result: undefined };
  "window.close": { params: undefined; result: undefined };
  "window.getState": { params: undefined; result: WindowState };
}

export interface EventPayloads {
  "window.stateChanged": WindowState;
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
