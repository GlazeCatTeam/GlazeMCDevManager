# @glaze/mcp

MCP 服务，运行在主进程。设计见 [docs/architecture/13-mcp.md](../../docs/architecture/13-mcp.md)。

| 文件 | 职责 |
|---|---|
| `src/tools.ts` | 能力白名单与 Zod 参数 Schema |
| `src/server.ts` | 官方 SDK、stdio 转发、带认证的随机本机命名管道 |
| `src/service.ts` | 客户端授权、隔离草稿、材料引用、审批与持久化操作状态 |
| `src/assets.ts` | 授权目录校验、流式快照、内容哈希、过期清理 |
| `src/model.ts` | 可注入业务端口、存储模型与对外脱敏 |

工作区内只依赖 `@glaze/contracts`；协议使用官方 SDK，Schema 使用 Zod，富文本使用 sanitize-html。业务服务、平台请求、文件选择和持久化均由宿主注入，不依赖 Electron。Windows 宿主的 `mcp-bridge.js` 以 Electron Node 模式运行，连接凭证使用当前用户 DPAPI 加密；设置页生成实际路径与环境变量。

当前实现、边界及测试见 [MCP 实装](../../docs/architecture/22-mcp-runtime.md)。HTTP 接入和第三方插件贡献工具尚未实现。
