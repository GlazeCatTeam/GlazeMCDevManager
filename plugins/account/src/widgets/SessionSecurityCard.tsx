import { Panel, Switch } from "@glaze/plugin-sdk";
import styles from "./SessionSecurityCard.module.css";

export interface SessionSettings {
  autoLogin: boolean;
  notifyOnExpire: boolean;
}

export interface SessionSecurityCardProps {
  settings: SessionSettings;
  onChange: (settings: SessionSettings) => void;
  className?: string | undefined;
}

const options: { key: keyof SessionSettings; title: string; description: string }[] = [
  { key: "autoLogin", title: "启动时自动登录", description: "使用最近登录的账号恢复会话" },
  { key: "notifyOnExpire", title: "会话过期时提醒", description: "在侧边栏和系统通知中提示" },
];

/** Session-related settings and how credentials are stored */
export function SessionSecurityCard({ settings, onChange, className }: SessionSecurityCardProps) {
  return (
    <Panel aria-label="会话与安全" title="会话与安全" className={className}>
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
              onChange={(checked) => onChange({ ...settings, [option.key]: checked })}
            />
          </div>
        ))}
      </div>
      <span className={styles.note}>
        凭据使用 Windows DPAPI 加密保存在本机，每个账号的会话互相隔离，只发往网易域名。
      </span>
    </Panel>
  );
}
