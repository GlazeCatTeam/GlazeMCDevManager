import { EVENT_CHANNEL, type EventMessage, type GlazeBridge, RPC_CHANNEL, type RpcRequest } from "@glaze/contracts";
import { contextBridge, ipcRenderer, webUtils } from "electron";

const bridge: GlazeBridge = {
  /** Restrict native File uploads to the dedicated bridge so scripts cannot submit paths */
  rpc(method, params) {
    if (method === "works.uploadDroppedResource")
      return Promise.resolve({ ok: false, error: { kind: "validation", message: "请通过拖入文件上传资源" } });
    const request: RpcRequest = { method, params };
    return ipcRenderer.invoke(RPC_CHANNEL, request);
  },
  /** Resolve a disk-backed File inside preload and keep its path out of web content */
  async uploadDroppedResource(file, params) {
    try {
      const nativePath = webUtils.getPathForFile(file);
      if (!nativePath) return { ok: false, error: { kind: "validation", message: "请拖入磁盘上的资源文件" } };
      return await ipcRenderer.invoke(RPC_CHANNEL, {
        method: "works.uploadDroppedResource",
        params: { ...params, nativePath },
      });
    } catch {
      return { ok: false, error: { kind: "validation", message: "无法读取拖入的文件，请重新选择" } };
    }
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
