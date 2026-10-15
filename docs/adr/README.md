# 架构决策记录（ADR）

记录重要的架构决定：当时的背景、做了什么决定、带来什么后果。已接受的 ADR 不修改内容；决定被推翻时新写一条，并在旧记录里标注"已被 ADR-xxxx 取代"。

| 编号 | 标题 | 状态 |
|---|---|---|
| [0001](0001-electron-over-tauri.md) | 使用 Electron 而不是 Tauri | 已接受 |
| [0002](0002-monorepo.md) | pnpm workspaces + Turborepo 单仓库 | 已接受 |
| [0003](0003-everything-is-a-plugin.md) | 内置功能也通过插件 API 实现 | 已接受 |
| [0004](0004-design-tokens.md) | 三层设计令牌 + 主题包 | 已接受 |
| [0005](0005-plugin-trust-tiers.md) | 插件按信任等级隔离运行 | 已接受 |
| [0006](0006-credentials-stay-in-main.md) | 凭据只存在于主进程 | 已接受 |
| [0007](0007-sqlite.md) | 本地存储使用 SQLite（better-sqlite3） | 已接受，驱动部分被 0010 取代 |
| [0008](0008-capabilities-and-mcp.md) | 每个功能先定义能力，并通过 MCP 对外部 AI 工具开放 | 已接受 |
| [0009](0009-official-login-window.md) | 登录使用网易官方登录窗口 | 已接受 |
| [0010](0010-node-sqlite.md) | SQLite 驱动改用 Electron 内置的 node:sqlite | 已接受 |

新增 ADR 时复制下面的模板，编号顺延。

```markdown
# ADR-xxxx 标题

- 状态：提议 / 已接受 / 已被 ADR-xxxx 取代
- 日期：YYYY-MM-DD

## 背景
## 决定
## 后果
```
