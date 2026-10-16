import {
  type AccountSummary,
  Button,
  Dialog,
  type McpClient,
  type McpGrant,
  mcpLevels,
  mcpPermissionLabels,
  mcpSelectablePermissions,
  Notice,
  TextButton,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import styles from "./GrantDialog.module.css";

const groups = [
  { title: "查看", permissions: mcpSelectablePermissions.filter((permission) => permission.endsWith(".read")) },
  {
    title: "修改与操作",
    permissions: mcpSelectablePermissions.filter((permission) => !permission.endsWith(".read")),
  },
];

/** Advanced grant editor: account scope, default account, individual permissions and material folders */
export function GrantDialog({
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
  const [grant, setGrant] = useState<McpGrant>({
    accounts: client.accounts,
    defaultAccount: client.defaultAccount,
    permissions: client.permissions,
  });
  /** Add or remove one value without duplicates */
  const toggle = <T,>(list: T[], value: T, on: boolean) =>
    on ? [...new Set([...list, value])] : list.filter((entry) => entry !== value);

  return (
    <Dialog
      className={styles.dialog}
      title={`${client.name} · 账号与详细权限`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            disabled={busy || !grant.accounts.length || !grant.accounts.includes(grant.defaultAccount)}
            onClick={() => onSave(grant)}
          >
            保存
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {error && <Notice>{error}</Notice>}
        <fieldset>
          <legend>可以使用的账号</legend>
          {accounts.map((account) => (
            <div key={account.id} className={styles.accountRow}>
              <Check
                label={`${account.nickname}${account.status === "expired" ? "（登录已过期）" : ""}`}
                checked={grant.accounts.includes(account.id)}
                disabled={account.status === "expired"}
                onChange={(on) => {
                  const next = toggle(grant.accounts, account.id, on);
                  setGrant({
                    ...grant,
                    accounts: next,
                    defaultAccount: next.includes(grant.defaultAccount) ? grant.defaultAccount : (next[0] ?? ""),
                  });
                }}
              />
              {grant.accounts.includes(account.id) &&
                (grant.defaultAccount === account.id ? (
                  <span className={styles.muted}>默认账号</span>
                ) : (
                  <TextButton tone="subtle" onClick={() => setGrant({ ...grant, defaultAccount: account.id })}>
                    设为默认
                  </TextButton>
                ))}
            </div>
          ))}
          {!accounts.length && <p className={styles.muted}>请先添加并登录账号。</p>}
          <p className={styles.muted}>AI 没有指定账号时使用默认账号，不会跟着 Glaze 界面的账号切换。</p>
        </fieldset>
        <fieldset>
          <legend>权限</legend>
          <div className={styles.presets}>
            {(["view", "assist", "full"] as const).map((level) => (
              <TextButton
                key={level}
                onClick={() => setGrant({ ...grant, permissions: [...mcpLevels[level].permissions] })}
              >
                套用「{mcpLevels[level].title}」
              </TextButton>
            ))}
          </div>
          {groups.map((group) => (
            <div key={group.title} className={styles.group}>
              <span className={styles.muted}>{group.title}</span>
              {group.permissions.map((permission) => (
                <Check
                  key={permission}
                  label={mcpPermissionLabels[permission]}
                  checked={grant.permissions.includes(permission)}
                  onChange={(on) => setGrant({ ...grant, permissions: toggle(grant.permissions, permission, on) })}
                />
              ))}
            </div>
          ))}
        </fieldset>
        <fieldset>
          <legend>素材文件夹（可选）</legend>
          <p className={styles.muted}>
            允许 AI 直接读取这些文件夹里的图片、视频和资源包来上传；不设置时，AI 上传素材会弹出文件选择框让你挑。
          </p>
          {client.directories.map((directory) => (
            <div key={directory.id} className={styles.accountRow}>
              <span>{directory.name}</span>
              <TextButton tone="danger" disabled={busy} onClick={() => onDirectory(directory.id)}>
                移除
              </TextButton>
            </div>
          ))}
          <div>
            <Button size="sm" disabled={busy} onClick={() => onDirectory()}>
              添加文件夹
            </Button>
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

/** Labelled checkbox that can be disabled, e.g. for expired accounts */
function Check({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
