import {
  type AccountSummary,
  Button,
  callHost,
  Dialog,
  type McpAccessRequest,
  type McpClient,
  type McpLevel,
  mcpLevelOf,
  mcpLevels,
  Notice,
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

/** Show configured tools with their live connection, permission level and account scope */
export function ClientCard({
  client,
  request,
  serviceRunning,
  accounts,
  action,
}: {
  client: McpClient;
  request: McpAccessRequest | undefined;
  serviceRunning: boolean;
  accounts: AccountSummary[];
  action: ReturnType<typeof useAction>;
}) {
  const [managing, setManaging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const level = mcpLevelOf(client.permissions);
  const names = accounts.filter((account) => client.accounts.includes(account.id)).map((a) => a.nickname);
  const waiting = serviceRunning && client.connected && !!request && request.expiresAt > Date.now();
  const state = !client.approved
    ? !serviceRunning
      ? "AI 连接服务未运行"
      : !client.connected
        ? "连接已断开"
        : waiting
          ? "等待你允许"
          : client.expiresAt <= Date.now()
            ? "授权请求已过期"
            : "尚未授权"
    : client.connected
      ? "使用中"
      : client.lastSeen
        ? `离线 · 上次使用 ${ago(client.lastSeen)}`
        : "等待 AI 工具连接";

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
      {client.configMissing && (
        <Notice
          action={
            <TextButton
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  unwrap(await callHost("mcp.repair", { clientId: client.id }));
                })
              }
            >
              重新写入
            </TextButton>
          }
        >
          {client.name} 的连接配置被移除或覆盖了，重启后会连不上。
        </Notice>
      )}
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
        <p className={styles.muted}>
          {!serviceRunning
            ? "请先在设置中开启 AI 连接服务，再让 AI 工具重新连接。"
            : !client.connected
              ? "请让 AI 工具重新连接 Glaze，再申请授权；也可以使用「连接 AI 工具」一键连接。"
              : waiting
                ? "请在弹窗或页面上方「等你允许」中允许连接。没看到弹窗时，可点击「重新申请授权」。"
                : "当前没有待处理的授权请求，点击「重新申请授权」后再允许连接。"}
        </p>
      )}
      <div className={styles.actions}>
        {!client.approved && (
          <Button
            disabled={action.busy || !client.connected || !serviceRunning}
            onClick={() =>
              void action.run(async () => {
                unwrap(await callHost("mcp.requestConnect", { clientId: client.id }));
              })
            }
          >
            重新申请授权
          </Button>
        )}
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
