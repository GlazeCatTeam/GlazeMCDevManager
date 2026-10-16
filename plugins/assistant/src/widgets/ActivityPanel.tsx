import {
  type AccountSummary,
  Button,
  callHost,
  Dialog,
  EmptyState,
  type McpOperation,
  type McpSnapshot,
  Notice,
  Panel,
  Tag,
  TextButton,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import { ago, unwrap, type useAction } from "../useMcp";
import styles from "./ActivityPanel.module.css";

// Audit outcomes in plain words; anything unlisted counts as a failure
const results: Record<string, { text: string; ok: boolean }> = {
  succeeded: { text: "完成", ok: true },
  permission_pending: { text: "等你允许", ok: false },
  forbidden: { text: "未获允许", ok: false },
  pairing_required: { text: "未连接", ok: false },
  rate_limited: { text: "太频繁", ok: false },
  validation: { text: "参数有误", ok: false },
  unknown: { text: "待核实", ok: false },
  created_id_unresolved: { text: "待核实", ok: false },
  platform_action: { text: "需在平台处理", ok: false },
  session_expired: { text: "登录过期", ok: false },
};
const states: Record<McpOperation["state"], string> = {
  pending: "准备执行",
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
  rejected: "已拒绝",
  expired: "已失效",
  unknown: "不确定是否成功",
  platform_action: "需要在开发者平台处理",
  created_id_unresolved: "作品已创建但没拿到 ID",
};
const attention = new Set(["unknown", "created_id_unresolved", "platform_action"]);

/** What the AI did recently, with uncertain writes pinned on top for the user to check */
export function ActivityPanel({
  snapshot,
  accounts,
  action,
}: {
  snapshot: McpSnapshot;
  accounts: AccountSummary[];
  action: ReturnType<typeof useAction>;
}) {
  const [open, setOpen] = useState<McpOperation | null>(null);
  const [all, setAll] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const check = snapshot.operations.filter((entry) => attention.has(entry.state) && !entry.resolvedAt);
  const audit = snapshot.audit.filter((entry) => !entry.tool.startsWith("glaze_")).slice(0, all ? 200 : 30);
  const nickname = (id: string | null) => accounts.find((account) => account.id === id)?.nickname ?? "";

  return (
    <Panel
      title="AI 最近做了什么"
      badge={check.length ? <Tag tone="warning">{check.length} 项待核实</Tag> : undefined}
      actions={
        <div className={styles.actions}>
          {snapshot.audit.length > 30 && (
            <TextButton onClick={() => setAll(!all)}>{all ? "收起" : "查看更多"}</TextButton>
          )}
          <TextButton
            tone="danger"
            disabled={action.busy || !snapshot.audit.length}
            onClick={() => {
              action.setMessage("");
              setConfirmClear(true);
            }}
          >
            清空记录
          </TextButton>
        </div>
      }
      className={styles.panel}
      aria-label="AI 操作记录"
    >
      <div className={styles.scroll}>
        {check.map((entry) => (
          <button key={entry.id} type="button" className={styles.attention} onClick={() => setOpen(entry)}>
            <b>
              {entry.clientName} 的「{entry.title ?? entry.method ?? "操作"}」{states[entry.state]}
            </b>
            <span>请到开发者平台确认结果，确认后点这里标记已核实。AI 不会自动重试。</span>
          </button>
        ))}
        {audit.map((entry) => {
          const result = results[entry.result] ?? { text: "失败", ok: false };
          return (
            <div key={entry.id} className={styles.row}>
              <time title={new Date(entry.time).toLocaleString()}>{ago(entry.time)}</time>
              <span className={styles.what}>
                <b>{entry.clientName}</b> {entry.title ?? entry.tool}
                {entry.account && nickname(entry.account) ? ` · ${nickname(entry.account)}` : ""}
              </span>
              <span className={result.ok ? styles.ok : styles.bad}>{result.text}</span>
            </div>
          );
        })}
        {!audit.length && !check.length && (
          <EmptyState title="还没有记录" hint="AI 帮你查询或修改内容后，会在这里留下记录" />
        )}
      </div>

      {confirmClear && (
        <Dialog
          title="清空 AI 操作记录？"
          onClose={() => {
            if (!action.busy) setConfirmClear(false);
          }}
          actions={
            <>
              <Button disabled={action.busy} onClick={() => setConfirmClear(false)}>
                取消
              </Button>
              <Button
                variant="danger"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    unwrap(await callHost("mcp.clearAudit"));
                    setAll(false);
                    setConfirmClear(false);
                  })
                }
              >
                {action.busy ? "正在清空…" : "确认清空"}
              </Button>
            </>
          }
        >
          <div className={styles.detail}>
            {action.message && <Notice>{action.message}</Notice>}
            <p>将清空所有 AI 工具、所有账号的历史操作记录，此操作无法撤销。</p>
            <p>待核实的操作会继续保留，清空记录不会撤销已执行的操作。</p>
          </div>
        </Dialog>
      )}

      {open && (
        <Dialog
          title={`${open.clientName} · ${states[open.state]}`}
          onClose={() => setOpen(null)}
          actions={
            <>
              <Button onClick={() => setOpen(null)}>关闭</Button>
              {!open.resolvedAt && attention.has(open.state) && (
                <Button
                  variant="primary"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      unwrap(await callHost("mcp.resolveOperation", { operationId: open.id }));
                      setOpen(null);
                    })
                  }
                >
                  我已核实
                </Button>
              )}
            </>
          }
        >
          <div className={styles.detail}>
            {action.message && <Notice>{action.message}</Notice>}
            <p>
              {open.title ?? open.method ?? "操作"}
              {open.itemId ? ` · 作品 ID ${open.itemId}` : ""}
              {nickname(open.account) ? ` · 账号 ${nickname(open.account)}` : ""}
            </p>
            <p>{open.message}</p>
            <small>
              {new Date(open.createdAt).toLocaleString()} · 记录编号 {open.id}
            </small>
          </div>
        </Dialog>
      )}
    </Panel>
  );
}
