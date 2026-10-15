# @glaze/mcp

MCP 服务，运行在主进程。设计见 [docs/architecture/13-mcp.md](../../docs/architecture/13-mcp.md)。

| 目录 | 职责 |
|---|---|
| `src/mapping` | 把标注 `mcp.expose` 的能力映射为 MCP 工具和资源 |
| `src/server` | MCP 服务本体，调用注入的 RPC 路由，带上 MCP 客户端身份 |
| `src/transport` | stdio 桥（`--mcp`）、命名管道、本机 HTTP |
| `src/pairing` | 客户端配对、授权范围、写操作确认策略 |

只依赖 `@glaze/contracts`，不直接依赖 `core`、`netease`、`storage`。
