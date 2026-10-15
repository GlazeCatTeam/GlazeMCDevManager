import { Notice, Panel, type SessionSettings, Switch, TextButton } from "@glaze/plugin-sdk";
import { useSessionSettings } from "../useSessionSettings";
import styles from "./SessionSecurityCard.module.css";

export interface SessionSecurityCardProps {
  className?: string | undefined;
}

const options: { key: keyof SessionSettings; title: string; description: string }[] = [
  { key: "autoLogin", title: "启动时自动登录", description: "下次启动时恢复上次使用的账号" },
  { key: "notifyOnExpire", title: "会话过期时提醒", description: "检测到过期时发送系统通知；登录状态始终显示" },
];

/** Session-related settings and how credentials are stored */
export function SessionSecurityCard({ className }: SessionSecurityCardProps) {
  const { settings, error, loading, saving, reload, save } = useSessionSettings();
  return (
    <Panel
      aria-label="会话与安全"
      title="会话与安全"
      className={className}
      actions={
        <span role="status" className={styles.muted}>
          {saving ? "保存中…" : loading ? "加载中…" : ""}
        </span>
      }
    >
      <div className={styles.content}>
        {error && (
          <Notice
            action={
              <TextButton onClick={reload} disabled={saving || loading}>
                重新读取
              </TextButton>
            }
          >
            {error}
          </Notice>
        )}
        {settings && (
          <div className={styles.list}>
            {options.map((option) => (
              <div key={option.key} className={styles.row}>
                <span className={styles.text}>
                  <span className={styles.title}>{option.title}</span>
                  <span className={styles.muted}>{option.description}</span>
                </span>
                <Switch
                  checked={settings[option.key]}
                  label={option.title}
                  disabled={loading || saving}
                  onChange={(checked) => void save({ ...settings, [option.key]: checked })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <span className={styles.note}>
        凭据使用 Windows DPAPI 加密保存在本机，每个账号的会话互相隔离，只发往网易域名。
      </span>
    </Panel>
  );
}
