# 09 IPC 与契约

## 原则

- 跨进程的每一个调用都有契约：方法名、参数 schema、返回 schema、所需权限。
- 契约集中定义在 `@glaze/contracts`，主进程、渲染进程、插件宿主进程共用同一份定义。
- 主进程**不信任任何调用方**：所有参数都重新校验，调用者身份由宿主注入。
- RPC 方法就是**能力**：界面、插件、MCP 客户端调用的是同一份定义。新功能先写方法定义，再写界面。见 [13 能力层与 MCP 接入](13-mcp.md)。

## 通道

| 通道 | 方向 | 用途 |
|---|---|---|
| `glaze:rpc` | 渲染 → 主（`invoke`） | 请求 / 响应 |
| `glaze:event` | 主 → 渲染 | 事件推送（账号切换、会话过期、任务进度等） |
| MessagePort | 插件宿主进程 ↔ 主 | 与上面相同的协议 |
| postMessage 桥 | 沙箱 iframe ↔ 渲染进程 Shell | 自定义界面插件转发 RPC，Shell 加上插件身份后再交给主进程 |
| MCP（stdio 桥 → 命名管道，或本机 HTTP） | AI 工具 ↔ 主进程 `@glaze/mcp` | MCP 工具调用转换为 RPC，带上 MCP 客户端身份 |

## 契约定义

```ts
export const rpc = {
  "app.getInitialRoute": method({
    params: z.void(),
    result: InitialRoute,
    caller: "shell",
  }),
  "account.list": method({
    params: z.void(),
    result: z.array(AccountSummary),
    permission: "netease:account.read",
    risk: "read",
    mcp: { expose: true, title: "列出账号", description: "列出已保存的网易开发者账号及会话状态，不含任何凭据。" },
  }),
  "account.switch": method({
    params: z.object({ uid: z.string() }),
    result: SwitchResult,
    permission: "netease:account.manage",
    risk: "write",
  }),
  "netease.request": method({
    params: z.object({ endpoint: z.string(), params: z.unknown() }),
    result: z.unknown(),
    permission: "byEndpoint",
  }),
};
```

- `caller: "shell"` 表示只有 Shell 能调用（插件调用直接拒绝）。
- `permission: "byEndpoint"` 表示权限取决于端点目录里声明的 `scope`。
- `risk`：`read` / `write` / `dangerous`，决定 MCP 调用是否需要用户确认。
- `mcp`：是否以及如何作为 MCP 工具暴露。`caller: "shell"` 和 `netease:account.manage` 的方法不能设置 `mcp.expose`，契约校验时强制检查。
- `netease.request` 是插件用的通用通道，**不直接暴露给 MCP**；MCP 只能调用有明确定义的业务能力。
- 返回值统一包装为 `{ ok: true, value } | { ok: false, error }`，错误带 `kind`，不抛跨进程异常。

## 请求信封

```ts
type RpcRequest = {
  id: string;
  method: string;
  params: unknown;
};

type CallerIdentity =
  | { type: "shell" }
  | { type: "plugin"; pluginId: string; trust: "builtin" | "declarative" | "custom-ui" }
  | { type: "mcp"; clientId: string; clientName: string };
```

调用者身份不在请求信封里，由接收方根据来源确定：

- 来自主窗口 preload：Shell 或内置插件。内置插件通过 SDK 发出的请求由 Shell 加上插件 ID（内置插件属于可信代码）。
- 来自插件宿主进程：按 MessagePort 对应的插件确定，插件无法改写。
- 来自沙箱 iframe：Shell 根据 iframe 所属插件填写。
- 来自 MCP：`@glaze/mcp` 根据配对记录填写，未配对的客户端不能调用任何能力。

## 事件

| 事件 | 载荷 | 订阅者 |
|---|---|---|
| `account.switched` | `{ uid }` | Shell、插件 |
| `account.expired` | `{ uid }` | Shell（跳转重新登录）、插件 |
| `account.loggedOut` | `{ uid }` | Shell、插件 |
| `login.progress` | `{ step, total, label }` | 登录界面 |
| `theme.changed` | `{ themeId, variant }` | Shell |
| `plugin.stateChanged` | `{ pluginId, state }` | Shell、设置页 |

插件只能收到与其权限相符的事件（例如没有 `netease:account.read` 收不到账号事件）。

## 版本

- 契约属于插件 API 的一部分，变更遵循语义化版本。
- 新增方法、新增可选字段：次版本。删除方法、改变字段含义：主版本，并写 ADR。
