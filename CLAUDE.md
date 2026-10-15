# GlazeMCDevManager

网易我的世界开发者管理工具（Windows，Electron + React + TypeScript，pnpm + Turborepo）。

## 每次对话开始

1. 先读 [docs/PROJECT.md](docs/PROJECT.md)：项目目标、不做什么、已敲定的决定、当前进度。
2. 涉及架构时再读 [docs/architecture/README.md](docs/architecture/README.md) 和相关 ADR。
3. 已敲定的决定不要重新讨论，除非用户主动提出要改。

## 必须同步维护 docs/PROJECT.md

- 用户敲定新方案或推翻旧方案：在"已敲定的决定"里追加一条（旧条目标注被取代，不删除）；涉及架构的同时补 ADR、改架构文档。
- 范围变化：改"项目目标"和"当前不做"。
- 开始或完成任务：改"当前进度"和"下一步"。
- 更新放在同一次改动里，不要攒到最后。

## 约定

- 回复用简体中文。
- 提交和推送都要用户明确同意。提交信息：英文前缀 + 空格 + 中文正文（如 `feat: 新增账号切换回滚`）。
- 不复制 MCDevManager 源码（BNCL-1.0），只参考行为和接口。
- 凭据只在主进程；插件只依赖 `@glaze/plugin-sdk`；渲染进程不依赖 core、netease、storage。
- 设计任何功能都要考虑外部 AI 工具通过 MCP 接入：先在 `@glaze/contracts` 定义能力（权限、`risk`、`mcp` 说明），再写界面；不允许只有界面能做的业务逻辑。并在 [docs/architecture/13-mcp.md](docs/architecture/13-mcp.md) 的模块工具清单登记。
- 常用命令：`pnpm dev`、`pnpm typecheck`、`pnpm lint`。
