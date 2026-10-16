# @glaze/mcp

MCP 服务，运行在主进程。设计见 [docs/architecture/13-mcp.md](../../docs/architecture/13-mcp.md)。

| 文件 | 职责 |
|---|---|
| `src/tools.ts` / `src/direct-tools.ts` / `src/business-tools.ts` | 明确的查询、作品直写与业务工具 Schema |
| `src/server.ts` | 官方 SDK、本机 Streamable HTTP、独立会话与来源校验 |
| `src/service.ts` | 客户端授权、后台操作快照、材料引用、直接执行与持久化操作状态 |
| `src/assets.ts` | 授权目录校验、流式快照、内容哈希、过期清理 |
| `src/model.ts` | 可注入业务端口、存储模型与对外脱敏 |

工作区内只依赖 `@glaze/contracts`；协议使用官方 SDK，Schema 使用 Zod，富文本使用 sanitize-html。业务服务、平台请求、文件选择和持久化均由宿主注入，不依赖 Electron。设置页填写端口并启用服务，默认监听 `http://127.0.0.1:17839/mcp`，端口会持久保存，客户端通过 URL 直接连接，再在应用内授权账号与权限。无需 stdio 桥或邀请凭证；新会话不按自报名称继承授权。详细使用与边界见 [MCP 实装](../../docs/architecture/22-mcp-runtime.md)。

授予对应权限后，AI 可直接上传、新建、修改保存和提审，无逐次确认。普通保存默认不提审。保留版本冲突、幂等与未知写入结果保护。

AI 直接通过作品 ID 和 patch 修改保存；已移除 AI 草稿列表与公开草稿工具。新增作品状态、推广、评论/反馈、消息与分析业务接口，使用独立授权和幂等键。
