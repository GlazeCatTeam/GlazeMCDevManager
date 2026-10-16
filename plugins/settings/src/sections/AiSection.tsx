import {
  type AccountSummary,
  Button,
  callHost,
  Dialog,
  EmptyState,
  isMcpPort,
  MCP_DEFAULT_PORT,
  type McpClient,
  type McpGrant,
  type McpOperation,
  type McpPermission,
  type McpSnapshot,
  mcpPermissions,
  Notice,
  onHostEvent,
  Switch,
  TextButton,
} from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { SettingGroup, SettingRow } from "../widgets/SettingRow";
import styles from "./AiSection.module.css";
import sections from "./Sections.module.css";

const labels: Record<McpPermission, string> = {
  "netease:account.read": "账号基本信息与开发者等级",
  "netease:works.read": "作品查询",
  "netease:analytics.read": "数据分析",
  "netease:rank.read": "排行榜",
  "netease:promotion.read": "活动查询",
  "netease:income.read": "收益与结算查询",
  "works:draft": "旧版编辑权限",
  "netease:works.write": "作品发布、撤回、定价、自测与删除",
  "netease:promotion.write": "活动报名、推广材料与轮播图申请",
  "netease:community.read": "玩家评论与反馈查询",
  "netease:community.write": "回复玩家评论与反馈",
  "netease:messages.read": "系统消息查询",
  "netease:messages.write": "系统消息已读与删除",
  "works:upload": "导入及上传材料（直接执行）",
  "works:save": "创建及保存作品（直接执行）",
  "works:review": "提交审核（直接执行）",
};
const actions: Record<McpOperation["action"], string> = {
  business: "业务操作",
  import: "上传材料",
  upload: "上传材料",
  create: "创建作品",
  save: "保存作品",
  save_review: "保存并提交审核",
  review: "提交审核",
};
const states: Record<McpOperation["state"], string> = {
  pending: "准备执行",
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
  rejected: "已拒绝",
  expired: "已失效",
  unknown: "结果待核实",
  platform_action: "需平台处理",
  created_id_unresolved: "待核实作品 ID",
};
/** Read native MCP state and keep stale responses from replacing newer events */
export function AiSection() {
  const [snapshot, setSnapshot] = useState<McpSnapshot | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientType, setClientType] = useState("Codex");
  const [portInput, setPortInput] = useState<string | null>(null);
  const [manage, setManage] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<McpClient | null>(null);
  const [filter, setFilter] = useState("");
  const [history, setHistory] = useState(false);
  const serial = useRef(0);
  const writing = useRef(false);
  const reload = useCallback(async () => {
    const turn = ++serial.current;
    try {
      const [state, users] = await Promise.all([callHost("mcp.snapshot"), callHost("account.list")]);
      if (turn !== serial.current) return;
      if (!state.ok) throw new Error(state.error.message);
      setSnapshot(state.value);
      if (users.ok) setAccounts(users.value);
    } catch (error) {
      if (turn === serial.current) setNotice(error instanceof Error ? error.message : "读取 MCP 状态失败");
    }
  }, []);
  useEffect(() => {
    void reload();
    const off = onHostEvent("mcp.changed", () => {
      void reload();
    });
    const accountOff = onHostEvent("account.changed", () => {
      void reload();
    });
    const timer = window.setInterval(() => {
      void reload();
    }, 15_000);
    return () => {
      serial.current++;
      off();
      accountOff();
      window.clearInterval(timer);
    };
  }, [reload]);

  /** Serialize user actions and display authoritative results or retryable errors */
  const run = async (task: () => Promise<void>) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setNotice("");
    try {
      await task();
      await reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败，请重试");
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };
  const selected = snapshot?.clients.find((client) => client.id === manage);
  const operation = snapshot?.operations.find((entry) => entry.id === review);
  const pending = snapshot?.operations.slice(0, 20) ?? [];
  const status = snapshot
    ? { off: "未开启", starting: "启动中", running: "运行中", error: "服务异常" }[snapshot.status]
    : "正在读取";
  const portText = portInput ?? String(snapshot?.port ?? MCP_DEFAULT_PORT);
  const port = Number(portText);
  const validPort = /^\d+$/.test(portText) && isMcpPort(port);
  const portChanged = port !== snapshot?.port;
  const endpoint = snapshot?.endpoint ?? "";
  /** Enable or rebind the listener using only the entered port */
  const applyPort = async (enabled: boolean) => {
    if (enabled && !validPort) throw new Error("端口必须是 1 到 65535 之间的整数");
    const result = await callHost("mcp.setEnabled", { enabled, ...(enabled ? { port } : {}) });
    if (!result.ok) throw new Error(result.error.message);
    setSnapshot(result.value);
    if (result.value.error) throw new Error(result.value.error);
    if (enabled) setPortInput(null);
  };
  const configuration =
    clientType === "Codex"
      ? `[mcp_servers.glaze]\nurl = ${JSON.stringify(endpoint)}`
      : JSON.stringify(
          { mcpServers: { glaze: { ...(clientType === "Claude Code" ? { type: "http" } : {}), url: endpoint } } },
          null,
          2,
        );

  return (
    <div className={sections.stack}>
      <p className={sections.muted}>
        让外部 AI 工具查询开发数据、编辑并保存作品。获得对应权限后直接执行，无需逐次确认。
      </p>
      {(notice || snapshot?.error) && <Notice>{notice || snapshot?.error}</Notice>}
      <SettingGroup title="连接服务" note={status}>
        <SettingRow
          title="MCP 服务"
          description={`${snapshot?.clients.filter((client) => client.connected).length ?? 0} 个客户端在线 · 本机 Streamable HTTP 接入`}
        >
          <Switch
            label="MCP 服务"
            checked={snapshot?.enabled ?? false}
            disabled={busy || !snapshot}
            onChange={(enabled) => {
              void run(() => applyPort(enabled));
            }}
          />
        </SettingRow>
        <SettingRow
          title="服务端口"
          description="填写端口并启用服务，外部 AI 工具即可连接本机。修改端口会断开已有连接。"
        >
          <div className={styles.portControls}>
            <input
              className={styles.input}
              aria-label="MCP 端口"
              inputMode="numeric"
              value={portText}
              aria-invalid={!validPort}
              disabled={busy || !snapshot}
              onChange={(event) => setPortInput(event.target.value)}
            />
            <Button
              size="xs"
              disabled={busy || !snapshot || !validPort || (snapshot.status === "running" && !portChanged)}
              onClick={() => {
                void run(() => applyPort(true));
              }}
            >
              {snapshot?.status === "running" ? "应用端口" : "启用服务"}
            </Button>
          </div>
        </SettingRow>
        {!validPort && <Notice>端口必须是 1 到 65535 之间的整数</Notice>}
        {endpoint && (
          <>
            <div className={styles.address}>
              <input className={styles.input} readOnly aria-label="MCP 连接地址" value={endpoint} />
              <Button
                size="xs"
                onClick={() => {
                  void run(async () => {
                    await navigator.clipboard.writeText(endpoint);
                    setNotice("已复制连接地址");
                  });
                }}
              >
                复制地址
              </Button>
            </div>
            <p className={sections.muted}>在 AI 工具中添加 HTTP MCP 服务，粘贴上方地址；连接后在下方授权账号与权限。</p>
            <details className={styles.form}>
              <summary>手动配置示例</summary>
              <label>
                客户端
                <select value={clientType} onChange={(event) => setClientType(event.target.value)}>
                  {["Codex", "Claude Code", "Cursor", "其他客户端"].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <textarea readOnly aria-label="MCP 连接配置" rows={6} value={configuration} />
              <TextButton
                onClick={() => {
                  void run(async () => {
                    await navigator.clipboard.writeText(configuration);
                    setNotice("已复制连接配置");
                  });
                }}
              >
                复制配置
              </TextButton>
            </details>
          </>
        )}
        {!snapshot && (
          <Button
            onClick={() => {
              void reload();
            }}
          >
            重新读取
          </Button>
        )}
      </SettingGroup>
      <SettingGroup title="客户端连接" note={String(snapshot?.clients.length ?? 0)}>
        {snapshot?.clients.map((client) => (
          <SettingRow
            key={client.id}
            title={client.name}
            description={[
              client.connected ? "已连接" : "离线",
              client.approved
                ? `${client.accounts.length} 个账号 / ${client.permissions.length} 项权限`
                : client.expiresAt < Date.now()
                  ? "授权等待已过期，请重新连接"
                  : "等待授权",
              `最近连接 ${client.lastSeen ? new Date(client.lastSeen).toLocaleString() : "尚无"}`,
            ].join(" · ")}
          >
            <div className={sections.actions}>
              <TextButton
                disabled={busy || (!client.approved && !client.connected)}
                onClick={() => setManage(client.id)}
              >
                {client.approved ? "管理权限" : "授权"}
              </TextButton>
              {client.connected && (
                <TextButton
                  disabled={busy}
                  onClick={() => {
                    void run(async () => {
                      const result = await callHost("mcp.disconnect", { clientId: client.id });
                      if (!result.ok) throw new Error(result.error.message);
                    });
                  }}
                >
                  断开
                </TextButton>
              )}
              <TextButton tone="danger" disabled={busy} onClick={() => setRevoke(client)}>
                撤销
              </TextButton>
            </div>
          </SettingRow>
        ))}
        {!snapshot?.clients.length && <EmptyState title="暂无客户端连接" hint="开启服务后，连接你正在使用的 AI 工具" />}
      </SettingGroup>
      <SettingGroup title="操作记录" note={String(pending.length)}>
        {pending.map((entry) => (
          <SettingRow
            key={entry.id}
            title={`${entry.clientName} · ${actions[entry.action]}`}
            description={
              (accounts.find((account) => account.id === entry.account)?.nickname ?? entry.account) +
              " · " +
              states[entry.state]
            }
          >
            <TextButton onClick={() => setReview(entry.id)}>查看结果</TextButton>
          </SettingRow>
        ))}
        {!pending.length && <EmptyState title="暂无操作记录" />}
      </SettingGroup>
      <SettingGroup title="最近活动" note={String(snapshot?.audit.length ?? 0)}>
        <div className={sections.toolbar}>
          <input
            className={styles.input}
            aria-label="筛选调用记录"
            placeholder="筛选客户端、工具、结果"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <TextButton onClick={() => setHistory(!history)}>{history ? "收起历史" : "查看完整记录"}</TextButton>
        </div>
        {snapshot?.operations
          .filter((entry) => !["pending", "running"].includes(entry.state))
          .slice(0, history ? 100 : 5)
          .map((entry) => (
            <SettingRow
              key={entry.id}
              title={`${actions[entry.action]} · ${states[entry.state]}`}
              description={entry.message}
            >
              <TextButton onClick={() => setReview(entry.id)}>详情</TextButton>
            </SettingRow>
          ))}
        <div className={styles.audit}>
          {snapshot?.audit
            .filter((entry) =>
              `${entry.clientName} ${entry.tool} ${entry.result}`.toLowerCase().includes(filter.toLowerCase()),
            )
            .slice(0, history ? 500 : 8)
            .map((entry) => (
              <div key={entry.id}>
                <time>{new Date(entry.time).toLocaleTimeString()}</time>
                <span>
                  {entry.clientName} · {entry.tool}
                </span>
                <span>{entry.result}</span>
              </div>
            ))}
        </div>
      </SettingGroup>
      <div className={styles.permissions}>
        AI 直接操作已授权账号的业务内容，无需建立草稿。账号范围固定；密码、Cookie 和登录凭据不会向 AI 工具开放。
      </div>

      {selected && (
        <GrantDialog
          key={selected.id}
          client={selected}
          accounts={accounts}
          busy={busy}
          error={notice}
          onClose={() => setManage(null)}
          onSave={(grant) => {
            void run(async () => {
              const result = await callHost("mcp.grant", { clientId: selected.id, grant });
              if (!result.ok) throw new Error(result.error.message);
              setManage(null);
            });
          }}
          onDirectory={(removeId) => {
            void run(async () => {
              const result = await callHost("mcp.directory", {
                clientId: selected.id,
                ...(removeId ? { removeId } : {}),
              });
              if (!result.ok) throw new Error(result.error.message);
            });
          }}
        />
      )}
      {revoke && (
        <Dialog
          className={styles.dialog}
          title={`撤销 ${revoke.name} 的授权？`}
          onClose={() => setRevoke(null)}
          actions={
            <>
              <Button onClick={() => setRevoke(null)}>取消</Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    const result = await callHost("mcp.revoke", { clientId: revoke.id });
                    if (!result.ok) throw new Error(result.error.message);
                    setRevoke(null);
                  });
                }}
              >
                撤销授权
              </Button>
            </>
          }
        >
          将断开客户端并使未执行请求失效。已经发出的平台操作仍需核对结果，历史记录保留。
        </Dialog>
      )}
      {operation && (
        <Dialog
          className={styles.dialog}
          title={`${actions[operation.action]} · ${states[operation.state]}`}
          onClose={() => setReview(null)}
          actions={
            <>
              <Button onClick={() => setReview(null)}>关闭</Button>
              {!operation.resolvedAt &&
                ["unknown", "created_id_unresolved", "platform_action", "failed"].includes(operation.state) && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        const result = await callHost("mcp.resolveOperation", { operationId: operation.id });
                        if (!result.ok) throw new Error(result.error.message);
                      });
                    }}
                  >
                    我已核实平台结果
                  </Button>
                )}
            </>
          }
        >
          <div className={styles.form}>
            {notice && <Notice>{notice}</Notice>}
            <p>
              {operation.clientName} · 账号{" "}
              {accounts.find((account) => account.id === operation.account)?.nickname ?? operation.account}
            </p>
            <p>
              {operation.method ?? actions[operation.action]}
              {operation.itemId ? ` · 作品 ID ${operation.itemId}` : ""}
            </p>
            <Notice>{operation.message}</Notice>
            {operation.action === "upload" &&
              snapshot?.assets
                .filter((asset) => asset.id === operation.assetId)
                .map((asset) => (
                  <p key={asset.id}>
                    上传至网易：{asset.name} · {(asset.size / 1024 / 1024).toFixed(2)} MB · SHA-256 {asset.hash}
                  </p>
                ))}
            <small>
              请求编号：{operation.id} · {new Date(operation.createdAt).toLocaleString()}
            </small>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Keep account scope and optional financial/write permissions visible in one grant form */
function GrantDialog({
  client,
  accounts,
  busy,
  error,
  onClose,
  onSave,
  onDirectory,
}: {
  client: McpClient;
  accounts: AccountSummary[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (grant: McpGrant) => void;
  onDirectory: (removeId?: string) => void;
}) {
  const initial =
    accounts.find((account) => account.current && account.status !== "expired")?.id ??
    accounts.find((account) => account.status !== "expired")?.id ??
    "";
  const [grant, setGrant] = useState<McpGrant>({
    accounts: client.approved ? client.accounts : initial ? [initial] : [],
    defaultAccount: client.approved ? client.defaultAccount : initial,
    permissions: client.approved
      ? client.permissions
      : mcpPermissions.filter((permission) => permission.endsWith(".read") && permission !== "netease:income.read"),
  });
  return (
    <Dialog
      className={styles.dialog}
      title={`${client.name} · 账号与权限`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={busy || !grant.accounts.length || !grant.accounts.includes(grant.defaultAccount)}
            onClick={() => onSave(grant)}
          >
            保存授权
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && <Notice>{error}</Notice>}
        <fieldset>
          <legend>可访问账号</legend>
          {accounts.map((account) => (
            <label key={account.id}>
              <input
                type="checkbox"
                disabled={account.status === "expired"}
                checked={grant.accounts.includes(account.id)}
                onChange={(event) =>
                  setGrant({
                    ...grant,
                    accounts: event.target.checked
                      ? [...grant.accounts, account.id]
                      : grant.accounts.filter((id) => id !== account.id),
                  })
                }
              />
              {account.nickname} {account.status === "expired" ? "（登录过期）" : ""}
            </label>
          ))}
          {!accounts.length && <p>请先添加并登录账号。</p>}
        </fieldset>
        <label>
          默认账号
          <select
            value={grant.defaultAccount}
            onChange={(event) => setGrant({ ...grant, defaultAccount: event.target.value })}
          >
            <option value="">请选择</option>
            {accounts
              .filter((account) => grant.accounts.includes(account.id))
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.nickname}
                </option>
              ))}
          </select>
        </label>
        <fieldset>
          <legend>能力权限</legend>
          <div className={sections.actions}>
            <TextButton
              onClick={() =>
                setGrant({ ...grant, permissions: mcpPermissions.filter((permission) => permission !== "works:draft") })
              }
            >
              全部业务权限
            </TextButton>
            <TextButton
              onClick={() =>
                setGrant({
                  ...grant,
                  permissions: mcpPermissions.filter(
                    (permission) => permission.endsWith(".read") && permission !== "netease:income.read",
                  ),
                })
              }
            >
              仅基础查询
            </TextButton>
          </div>
          {mcpPermissions
            .filter((permission) => permission !== "works:draft")
            .map((permission) => (
              <label key={permission}>
                <input
                  type="checkbox"
                  checked={grant.permissions.includes(permission)}
                  onChange={(event) =>
                    setGrant({
                      ...grant,
                      permissions: event.target.checked
                        ? [...grant.permissions, permission]
                        : grant.permissions.filter((value) => value !== permission),
                    })
                  }
                />
                {labels[permission]}
              </label>
            ))}
        </fieldset>
        {client.approved && (
          <fieldset>
            <legend>授权素材目录</legend>
            {client.directories.map((directory) => (
              <div key={directory.id}>
                {directory.name}
                <TextButton disabled={busy} onClick={() => onDirectory(directory.id)}>
                  移除
                </TextButton>
              </div>
            ))}
            <Button disabled={busy} onClick={() => onDirectory()}>
              选择素材目录
            </Button>
            <p>允许读取此目录中的材料；获得上传权限后可直接上传到网易。</p>
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}
