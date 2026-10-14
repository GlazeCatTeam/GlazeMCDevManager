import { EVENT_CHANNEL, type EventMessage, type GlazeBridge, RPC_CHANNEL, type RpcRequest } from "@glaze/contracts";
import { contextBridge, ipcRenderer } from "electron";

const bridge: GlazeBridge = {
  rpc(method, params) {
    const request: RpcRequest = { method, params };
    return ipcRenderer.invoke(RPC_CHANNEL, request);
  },
  on(event, listener) {
    const handler = (_e: Electron.IpcRendererEvent, message: EventMessage) => {
      if (message.event === event) {
        listener(message.payload as Parameters<typeof listener>[0]);
      }
    };
    ipcRenderer.on(EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, handler);
  },
};

contextBridge.exposeInMainWorld("glaze", bridge);
