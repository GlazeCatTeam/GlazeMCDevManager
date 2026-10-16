import {
  type AccountSummary,
  Button,
  callHost,
  Dialog,
  type McpClient,
  type McpLevel,
  mcpLevelOf,
  mcpLevels,
  SegmentedControl,
  Tag,
  TextButton,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import { ago, unwrap, type useAction } from "../useMcp";
import styles from "./ClientCard.module.css";
import { GrantDialog } from "./GrantDialog";

const levelOptions = [
  { value: "view", label: mcpLevels.view.title },
  { value: "assist", label: mcpLevels.assist.title },
  { value: "full", label: mcpLevels.full.title },
  { value: "custom", label: "自定义", disabled: true },
] as const;

/** One connected tool: status, permission level and account scope at a glance */
export function ClientCard({
  client,
  accounts,
  action,
}: {
  client: McpClient;
  accounts: AccountSummary[];
  action: ReturnType<typeof useAction>;
}) {
  const [managing, setManaging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const level = mcpLevelOf(client.permissions);
  const names = accounts.filter((account) => client.accounts.includes(account.id)).map((a) => a.nickname);
  const state = !client.approved
    ? "等待你允许"
    : client.connected
      ? "使用中"
      : `离线 · 上次使用 ${ago(client.lastSeen)}`;

  /** Switch the level while keeping the account scope */
  const setLevel = (next: McpLevel) =>
    action.run(async () => {
      unwrap(
        await callHost("mcp.grant", {
          clientId: client.id,
          grant: {
            accounts: client.accounts,
            defaultAccount: client.defaultAccount,
            permissions: mcpLevels[next].permissions,
          },
        }),
      );
    });

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <span className={client.connected ? `${styles.dot} ${styles.on}` : styles.dot} aria-hidden />
        <div className={styles.title}>
          <b>{client.name}</b>
          <span className={styles.muted}>{state}</span>
        </div>
        {!client.persistent && <Tag tone="warning">临时连接</Tag>}
      </div>
      {client.approved ? (
        <>
          <SegmentedControl
            label={`${client.name} 的权限`}
            options={levelOptions.filter((option) => option.value !== "custom" || level === "custom")}
            value={level}
            onChange={(next) => {
              if (next !== "custom") void setLevel(next);
            }}
          />
          <p className={styles.muted}>
            {level === "custom" ? "已自定义权限" : mcpLevels[level].description}
            <br />
            可用账号：{names.length ? names.join("、") : "无（请在管理里选择）"}
          </p>
          {!client.persistent && (
            <p className={styles.muted}>这个工具是手动添加的，重启后需要重新允许。建议用「连接 AI 工具」一键连接。</p>
          )}
        </>
      ) : (
        <p className={styles.muted}>这个工具想连接 Glaze，请在弹窗中点「允许」。</p>
      )}
      <div className={styles.actions}>
        {client.approved && (
          <TextButton disabled={action.busy} onClick={() => setManaging(true)}>
            账号与详细权限
          </TextButton>
        )}
        <TextButton tone="danger" disabled={action.busy} onClick={() => setRemoving(true)}>
          移除
        </TextButton>
      </div>

      {managing && (
        <GrantDialog
          client={client}
          accounts={accounts}
          busy={action.busy}
          error={action.message}
          onClose={() => setManaging(false)}
          onSave={(grant) =>
            void action.run(async () => {
              unwrap(await callHost("mcp.grant", { clientId: client.id, grant }));
              setManaging(false);
            })
          }
          onDirectory={(removeId) =>
            void action.run(async () => {
              unwrap(await callHost("mcp.directory", { clientId: client.id, ...(removeId ? { removeId } : {}) }));
            })
          }
        />
      )}
      {removing && (
        <Dialog
          title={`移除 ${client.name}？`}
          onClose={() => setRemoving(false)}
          actions={
            <>
              <Button onClick={() => setRemoving(false)}>取消</Button>
              <Button
                variant="danger"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    unwrap(await callHost("mcp.revoke", { clientId: client.id }));
                    setRemoving(false);
                  })
                }
              >
                移除
              </Button>
            </>
          }
        >
          移除后它会立刻断开，不能再使用你的账号；Glaze 写入的连接配置也会一并删除。已经执行过的操作不会撤回。
        </Dialog>
      )}
    </article>
  );
}
