# @glaze/desktop

Electron 桌面应用。负责组装内核包、创建窗口、注册 IPC 和资源协议，渲染进程中运行 Shell。

- `src/main`：主进程（bootstrap、windows、ipc、protocol）
- `src/preload`：通过 contextBridge 暴露 `window.glaze`
- `src/renderer`：Shell（shell、routes、startup）

详见 [02 进程模型与启动流程](../../docs/architecture/02-process-model.md)。
