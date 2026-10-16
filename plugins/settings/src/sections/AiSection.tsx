import {
  type AccountSummary,
  Button,
  callHost,
  Dialog,
  EmptyState,
  type McpClient,
  type McpDraft,
  type McpGrant,
  type McpInvitation,
  type McpOperation,
  type McpPermission,
  type McpSnapshot,
  mcpPermissions,
  Notice,
  onHostEvent,
  remoteImageUrl,
  Switch,
  TextButton,
  useNavigation,
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
  "works:draft": "编辑本地 AI 草稿",
  "works:upload": "导入及上传材料（上传需确认）",
  "works:save": "创建及保存作品（需确认）",
  "works:review": "提交审核（每次确认）",
};
const actions: Record<McpOperation["action"], string> = {
  import: "选择材料",
  upload: "上传材料",
  create: "创建作品",
  save: "保存作品",
  save_review: "保存并提交审核",
  review: "提交审核",
};
const states: Record<McpOperation["state"], string> = {
  pending: "等待确认",
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
  rejected: "已拒绝",
  expired: "已失效",
  unknown: "结果待核实",
  platform_action: "需平台处理",
  created_id_unresolved: "待核实作品 ID",
};
const fieldLabels: Record<string, string> = {
  item_name: "作品名称",
  is_domain_server_item: "专区",
  is_original: "原创标记",
  tag: "标签",
  activity_desc: "活动说明",
  dlc_info: "关联模组配置",
  relate_item_id: "关联作品",
  sync_pc_flag: "同步 PC",
  corp_proof_image: "授权证明",
  price: "价格",
  price_rank: "价格档位",
  price_type: "定价类型",
  discount: "折扣",
  info: "作品详情",
  pri_type: "资源类别",
  sub_type: "资源子类别",
  mod_second_type: "模组分类",
  mod_version: "modAPI 版本",
  label_type_list: "推荐标签",
  mount_call_enabled: "坐骑功能",
  res: "资源文件",
  prerequisite_items: "前置依赖",
  pe_is_add_play_plan: "畅玩计划",
  channel: "作品图片",
  banner_pic: "推广图",
  video_info_list: "视频与封面",
  update_summary: "更新纪要",
  weak_offline: "弱下架",
  weak_offline_reason: "弱下架原因",
  sync_item_info: "PC 同步内容",
  lobby_min_num: "大厅最少人数",
  lobby_max_num: "大厅最多人数",
  lobby_force_max_num: "大厅人数上限",
  lobby_tags: "大厅标签",
  is_lobby_competitive: "竞技模式",
  is_asymmetric: "非对称玩法",
  lobby_camps: "阵营",
  lobby_player_num: "玩家人数",
  lobby_normal_mode: "普通模式",
  lobby_reconnect_time: "重连时长",
};

/** Read native MCP state and keep stale responses from replacing newer events */
export function AiSection() {
  const { navigate } = useNavigation();
  const [snapshot, setSnapshot] = useState<McpSnapshot | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<McpInvitation | null>(null);
  const [clientType, setClientType] = useState("Codex");
  const [wizard, setWizard] = useState(false);
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
  const draft = snapshot?.drafts.find((entry) => entry.id === operation?.draftId);
  const pending = snapshot?.operations.filter((entry) => entry.state === "pending" || entry.state === "running") ?? [];
  const status = snapshot
    ? { off: "未开启", starting: "启动中", running: "运行中", error: "服务异常" }[snapshot.status]
    : "正在读取";
  const configuration = invite
    ? clientType === "Codex"
      ? `[mcp_servers.glaze]\ncommand = ${JSON.stringify(invite.command)}\nargs = ${JSON.stringify(invite.args)}\n\n[mcp_servers.glaze.env]\nELECTRON_RUN_AS_NODE = "1"`
      : JSON.stringify(
          { mcpServers: { glaze: { command: invite.command, args: invite.args, env: invite.env } } },
          null,
          2,
        )
    : "";

  return (
    <div className={sections.stack}>
      <p className={sections.muted}>让外部 AI 工具查询开发数据、协助编辑作品。作品提交前由你确认。</p>
      {(notice || snapshot?.error) && <Notice>{notice || snapshot?.error}</Notice>}
      <SettingGroup title="连接服务" note={status}>
        <SettingRow
          title="MCP 服务"
          description={`${snapshot?.clients.filter((client) => client.connected).length ?? 0} 个客户端在线 · 本机 stdio 接入`}
        >
          <Switch
            label="MCP 服务"
            checked={snapshot?.enabled ?? false}
            disabled={busy || !snapshot}
            onChange={(enabled) => {
              void run(async () => {
                const result = await callHost("mcp.setEnabled", { enabled });
                if (!result.ok) throw new Error(result.error.message);
                setSnapshot(result.value);
              });
            }}
          />
        </SettingRow>
        <SettingRow title="连接外部 AI 工具" description="支持 Codex、Claude Code、Cursor 及其他 MCP 客户端">
          <Button
            size="xs"
            disabled={busy || snapshot?.status !== "running"}
            onClick={() => {
              setInvite(null);
              setWizard(true);
            }}
          >
            连接 AI 工具
          </Button>
        </SettingRow>
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
      <SettingGroup title="已授权客户端" note={String(snapshot?.clients.length ?? 0)}>
        {snapshot?.clients.map((client) => (
          <SettingRow
            key={client.id}
            title={client.name}
            description={[
              client.connected ? "已连接" : "离线",
              client.approved
                ? `${client.accounts.length} 个账号 / ${client.permissions.length} 项权限`
                : client.expiresAt < Date.now()
                  ? "邀请已过期"
                  : "等待连接与授权",
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
        {!snapshot?.clients.length && (
          <EmptyState title="暂无已授权客户端" hint="开启服务后，连接你正在使用的 AI 工具" />
        )}
      </SettingGroup>
      <SettingGroup title="待处理请求" note={String(pending.length)}>
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
            <TextButton onClick={() => setReview(entry.id)}>查看请求</TextButton>
          </SettingRow>
        ))}
        {!pending.length && <EmptyState title="没有等待处理的请求" />}
      </SettingGroup>
      <SettingGroup title="AI 草稿" note={String(snapshot?.drafts.length ?? 0)}>
        {snapshot?.drafts
          .slice(-20)
          .reverse()
          .map((entry) => (
            <SettingRow
              key={entry.id}
              title={String(entry.previewFields?.item_name || entry.document.fields.item_name || "新作品草稿")}
              description={
                (snapshot.clients.find((client) => client.id === entry.clientId)?.name ?? "已撤销客户端") +
                " · 版本 " +
                entry.revision +
                (entry.locked ? " · 执行中或结果待核实" : " · 本地草稿")
              }
            >
              <TextButton onClick={() => navigate("glaze.works/works", { mcpDraft: entry.id })}>
                打开作品草稿
              </TextButton>
            </SettingRow>
          ))}
        {!snapshot?.drafts.length && <EmptyState title="暂无 AI 草稿" />}
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
        账号范围固定，不跟随界面账号切换。目录读取与上传授权分开。密码、Cookie 和登录凭据不会向 AI 工具开放。
      </div>

      {wizard && (
        <Dialog
          className={styles.dialog}
          title="连接 AI 工具"
          onClose={() => setWizard(false)}
          actions={<Button onClick={() => setWizard(false)}>完成</Button>}
        >
          <div className={styles.form}>
            {notice && <Notice>{notice}</Notice>}
            <label>
              1. 选择客户端
              <select
                disabled={!!invite || busy}
                value={clientType}
                onChange={(event) => setClientType(event.target.value)}
              >
                {["Codex", "Claude Code", "Cursor", "其他客户端"].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            {!invite ? (
              <Button
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    const result = await callHost("mcp.invite", { name: clientType });
                    if (!result.ok) throw new Error(result.error.message);
                    setInvite(result.value);
                  });
                }}
              >
                生成连接配置
              </Button>
            ) : (
              <>
                <p>
                  2. 将配置添加到客户端的 MCP 设置，再启动连接。邀请在 {new Date(invite.expiresAt).toLocaleTimeString()}{" "}
                  过期。
                </p>
                <textarea readOnly aria-label="MCP 连接配置" rows={9} value={configuration} />
                <Button
                  onClick={() => {
                    void run(async () => {
                      await navigator.clipboard.writeText(configuration);
                      setNotice("已复制连接配置");
                    });
                  }}
                >
                  复制配置
                </Button>
                <p role="status">
                  3.{" "}
                  {snapshot?.clients.find((client) => client.id === invite.clientId)?.connected
                    ? "已收到客户端连接，请选择账号与权限。"
                    : "等待客户端连接；请保持本应用运行。"}
                </p>
                <Button
                  disabled={!snapshot?.clients.find((client) => client.id === invite.clientId)?.connected}
                  onClick={() => {
                    setWizard(false);
                    setManage(invite.clientId);
                  }}
                >
                  设置授权
                </Button>
              </>
            )}
          </div>
        </Dialog>
      )}
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
              {operation.state === "pending" && (
                <>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        const result = await callHost("mcp.decide", {
                          operationId: operation.id,
                          revision: operation.revision,
                          approve: false,
                        });
                        if (!result.ok) throw new Error(result.error.message);
                      });
                    }}
                  >
                    拒绝
                  </Button>
                  <Button
                    variant="primary"
                    disabled={busy || !snapshot?.enabled}
                    onClick={() => {
                      void run(async () => {
                        const result = await callHost("mcp.decide", {
                          operationId: operation.id,
                          revision: operation.revision,
                          approve: true,
                        });
                        if (!result.ok) throw new Error(result.error.message);
                      });
                    }}
                  >
                    {busy ? "正在处理…" : `确认${actions[operation.action]}`}
                  </Button>
                </>
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
              作品 {String(draft?.previewFields?.item_name ?? "新作品")} · ID {draft?.itemId ?? "尚未创建"} · 草稿版本{" "}
              {operation.revision}
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
            {draft && !["import", "upload"].includes(operation.action) && <DraftDiff draft={draft} />}
            {draft && (
              <TextButton onClick={() => navigate("glaze.works/works", { mcpDraft: draft.id })}>
                进入作品编辑页预览或继续编辑
              </TextButton>
            )}
            <small>
              请求编号：{operation.id} · {new Date(operation.createdAt).toLocaleString()}
            </small>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Show explicit changes as escaped text; rich content uses the existing editor preview */
function DraftDiff({ draft }: { draft: McpDraft }) {
  return (
    <div className={styles.diff}>
      {Object.keys(draft.patch).length ? (
        Object.entries(draft.patch).map(([key, value]) => (
          <details key={key} open={["item_name", "price", "update_summary"].includes(key)}>
            <summary>
              {fieldLabels[key] ?? key}
              {["price", "price_rank", "res", "weak_offline"].includes(key) ? " · 重点变更" : ""}
            </summary>
            <div>
              <div>
                <small>修改前</small>
                <DiffValue value={draft.document.fields[key] ?? null} />
              </div>
              <div>
                <small>修改后</small>
                <DiffValue value={draft.previewFields?.[key] ?? value} />
              </div>
            </div>
          </details>
        ))
      ) : (
        <p>无字段修改，将按当前作品快照执行。</p>
      )}
    </div>
  );
}

/** Preview known platform media without displaying signed upload envelopes */
function DiffValue({ value }: { value: unknown }) {
  const images: string[] = [];
  const inspect = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(inspect);
    if (entry && typeof entry === "object") {
      const object = entry as Record<string, unknown>;
      if (typeof object.body === "string" && typeof object.sign === "string") {
        try {
          const body = JSON.parse(object.body) as Record<string, unknown>;
          return inspect(body.url ?? body.filename ?? "已上传材料");
        } catch {
          return "已上传材料";
        }
      }
      return Object.fromEntries(Object.entries(object).map(([key, data]) => [fieldLabels[key] ?? key, inspect(data)]));
    }
    if (typeof entry === "string" && /^https:\/\//.test(entry) && /\.(png|jpe?g|webp)(\?|$)/i.test(entry))
      images.push(entry);
    return entry;
  };
  const display = inspect(value);
  return (
    <>
      <pre>{typeof display === "string" ? display : JSON.stringify(display, null, 2)}</pre>
      {images.slice(0, 8).map((url) => (
        <img className={styles.media} key={url} src={remoteImageUrl(url) ?? undefined} alt="作品图片预览" />
      ))}
    </>
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
      : mcpPermissions.filter(
          (permission) => permission.startsWith("netease:") && permission !== "netease:income.read",
        ),
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
          {mcpPermissions.map((permission) => (
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
            <p>允许读取此目录中的材料；上传到网易仍需确认。</p>
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}
