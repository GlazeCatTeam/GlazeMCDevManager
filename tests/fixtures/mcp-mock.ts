// In-page host bridge for previewing the AI assistant page without Electron; UI tests may install their own first

type Handler = (payload: unknown) => void;

/** Install a stateful fake of the MCP host methods used by the assistant page */
export function installMcpMock(): void {
  const listeners = new Map<string, Set<Handler>>();
  const account = { id: "account-a", nickname: "MCP 测试账号", status: "active", current: true };
  const now = Date.now();
  const read = [
    "netease:account.read",
    "netease:works.read",
    "netease:analytics.read",
    "netease:rank.read",
    "netease:promotion.read",
    "netease:community.read",
    "netease:messages.read",
  ];
  const assist = [
    ...read,
    "netease:income.read",
    "netease:community.write",
    "netease:messages.write",
    "works:upload",
    "works:save",
  ];
  const state = {
    port: 17839,
    endpoint: "http://127.0.0.1:17839/mcp",
    enabled: true,
    status: "running",
    error: null as string | null,
    clients: [
      {
        id: "client-a",
        name: "Claude Code",
        tool: "claude-code",
        persistent: true,
        approved: true,
        connected: true,
        accounts: [account.id],
        defaultAccount: account.id,
        permissions: assist,
        directories: [],
        lastSeen: new Date(now - 120_000).toISOString(),
        expiresAt: Number.MAX_SAFE_INTEGER,
      },
      {
        id: "client-b",
        name: "Cherry Studio",
        persistent: false,
        approved: false,
        connected: true,
        accounts: [],
        defaultAccount: "",
        permissions: [],
        directories: [],
        lastSeen: new Date(now).toISOString(),
        expiresAt: now + 600_000,
      },
    ],
    requests: [
      {
        id: "request-a",
        clientId: "client-a",
        clientName: "Claude Code",
        kind: "permission",
        permissions: ["works:review"],
        reason: "为了把你刚修改的《冒险工具包》提交审核",
        createdAt: now,
        expiresAt: now + 600_000,
      },
    ],
    operations: [
      {
        id: "op-a",
        clientId: "client-a",
        clientName: "Claude Code",
        account: account.id,
        method: "works.publish",
        title: "发布作品",
        itemId: "123456789012345678",
        action: "business",
        state: "unknown",
        phase: "sent",
        message: "请求已发送但没有收到平台确认",
        createdAt: now - 3_600_000,
        expiresAt: now,
      },
    ],
    drafts: [],
    assets: [],
    audit: [
      ["works_save", "直接修改并保存作品", "succeeded", 60_000],
      ["comments_list", "玩家评论", "succeeded", 180_000],
      ["income_list", "收益列表", "permission_pending", 600_000],
      ["analytics_overview", "数据概览", "succeeded", 7_200_000],
    ].map(([tool, title, result, ago], index) => ({
      id: `log-${index}`,
      time: new Date(now - Number(ago)).toISOString(),
      clientId: "client-a",
      clientName: "Claude Code",
      tool,
      title,
      account: account.id,
      result,
    })),
  };
  /** Notify subscribers the way the host broadcasts mcp.changed */
  const emit = () => {
    for (const handler of listeners.get("mcp.changed") ?? [])
      handler({ pendingCount: 0, requestCount: state.requests.length, connectedCount: 1 });
  };
  const calls: { method: string; params: unknown }[] = [];
  Object.assign(globalThis, {
    __mcpCalls: calls,
    __mcpState: state,
    __mcpEmit: emit,
    glaze: {
      on: (name: string, handler: Handler) => {
        const entries = listeners.get(name) ?? new Set();
        entries.add(handler);
        listeners.set(name, entries);
        return () => entries.delete(handler);
      },
      rpc: async (method: string, params: Record<string, unknown> | undefined) => {
        calls.push({ method, params });
        if (method === "account.list") return { ok: true, value: [account] };
        if (method === "mcp.snapshot") return { ok: true, value: structuredClone(state) };
        if (method === "mcp.installers")
          return {
            ok: true,
            value: [
              {
                id: "claude-code",
                name: "Claude Code",
                detected: true,
                target: "Claude Code 用户配置（所有项目可用）",
              },
              { id: "codex", name: "Codex", detected: true, target: "C:\\Users\\me\\.codex\\config.toml" },
              { id: "cursor", name: "Cursor", detected: false, target: "C:\\Users\\me\\.cursor\\mcp.json" },
              { id: "other", name: "其他 AI 工具", detected: true, target: "复制一句话发给 AI，让它自己完成配置" },
            ],
          };
        if (method === "mcp.connect") {
          const other = params?.tool === "other";
          const endpoint = "http://127.0.0.1:17839/mcp?key=preview-key";
          return {
            ok: true,
            value: {
              clientId: "client-new",
              installed: !other,
              message: other
                ? "把下面这句话发给你的 AI 工具，它会自己完成连接。"
                : "已写入配置。重启后直接用中文告诉它你想做什么即可。",
              endpoint,
              prompt: `请帮我添加一个 MCP 服务器：名称 glaze，传输方式 Streamable HTTP（http），地址 ${endpoint} 。`,
            },
          };
        }
        if (method === "mcp.answer") {
          const request = state.requests.find((entry) => entry.id === params?.requestId);
          state.requests = state.requests.filter((entry) => entry.id !== params?.requestId);
          const client = state.clients.find((entry) => entry.id === request?.clientId);
          if (client && params?.decision === "always")
            client.permissions = [...client.permissions, ...(request?.permissions ?? [])];
          emit();
          return { ok: true, value: undefined };
        }
        if (method === "mcp.grant") {
          const client = state.clients.find((entry) => entry.id === params?.clientId);
          if (client) Object.assign(client, params?.grant);
        }
        if (method === "mcp.revoke") state.clients = state.clients.filter((entry) => entry.id !== params?.clientId);
        if (method === "mcp.resolveOperation")
          state.operations = state.operations.map((entry) =>
            entry.id === params?.operationId ? { ...entry, resolvedAt: Date.now() } : entry,
          );
        if (method === "mcp.setEnabled") {
          state.enabled = params?.enabled === true;
          state.status = state.enabled ? "running" : "off";
          if (state.enabled && typeof params?.port === "number") state.port = params.port;
          state.endpoint = state.enabled ? `http://127.0.0.1:${state.port}/mcp` : null;
        }
        emit();
        return { ok: true, value: structuredClone(state) };
      },
    },
  });
}
