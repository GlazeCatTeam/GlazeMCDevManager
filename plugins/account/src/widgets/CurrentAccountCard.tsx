import {
  type AccountSummary,
  Avatar,
  avatarColorsFor,
  Button,
  Panel,
  remoteImageUrl,
  TextButton,
} from "@glaze/plugin-sdk";
import { loginMethodLabels } from "../constants";
import { timeOfDay } from "../format";
import styles from "./CurrentAccountCard.module.css";

export interface CurrentAccountCardProps {
  account: AccountSummary;
  verifying: boolean;
  onVerify: () => void;
  onOpenConsole: () => void;
  onLogout: () => void;
  className?: string | undefined;
}

/** Status line of the session */
function statusText(account: AccountSummary): string {
  if (account.status === "expired") {
    return "登录已过期";
  }
  return account.status === "offline" ? "离线 · 网络异常" : "会话有效";
}

/** The account every module currently uses, with its session state */
export function CurrentAccountCard({
  account,
  verifying,
  onVerify,
  onOpenConsole,
  onLogout,
  className,
}: CurrentAccountCardProps) {
  const valid = account.status === "active";

  return (
    <Panel aria-label="当前账号" title="当前账号" className={className}>
      <div className={styles.identity}>
        <Avatar src={remoteImageUrl(account.avatarUrl)} colors={avatarColorsFor(account.id)} size={72} />
        <div className={styles.text}>
          <span className={styles.nickname}>{account.nickname}</span>
          <span className={styles.muted}>{account.passport ?? "通行证账号未知（Cookie 导入）"}</span>
          <span className={styles.status}>
            <span className={valid ? styles.dotValid : styles.dotExpired} aria-hidden="true" />
            <span className={valid ? styles.valid : styles.expired}>{statusText(account)}</span>
            <span className={styles.muted}>
              · {loginMethodLabels[account.loginMethod]} · {timeOfDay(account.lastLoginAt)} 已验证
            </span>
          </span>
        </div>
      </div>
      <div className={styles.actions}>
        <Button onClick={onVerify} disabled={verifying}>
          {verifying ? "验证中…" : "重新验证"}
        </Button>
        <Button onClick={onOpenConsole}>打开开发者后台</Button>
        <TextButton tone="danger" className={styles.logout} onClick={onLogout}>
          退出登录
        </TextButton>
      </div>
    </Panel>
  );
}
