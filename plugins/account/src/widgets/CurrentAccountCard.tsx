import { Button, Panel, PixelAvatar, TextButton } from "@glaze/plugin-sdk";
import { loginMethodLabels, type SavedAccount } from "../mock";
import styles from "./CurrentAccountCard.module.css";

export interface CurrentAccountCardProps {
  account: SavedAccount;
  verifiedAt: string;
  onVerify: () => void;
  onOpenConsole: () => void;
  onLogout: () => void;
  className?: string | undefined;
}

/** The account every module currently uses, with its session state */
export function CurrentAccountCard({
  account,
  verifiedAt,
  onVerify,
  onOpenConsole,
  onLogout,
  className,
}: CurrentAccountCardProps) {
  const idLine = account.email ? `UID ${account.uid} · ${account.email}` : `UID ${account.uid}`;

  return (
    <Panel aria-label="当前账号" title="当前账号" className={className}>
      <div className={styles.identity}>
        <PixelAvatar colors={account.avatar} size={72} />
        <div className={styles.text}>
          <span className={styles.nickname}>{account.nickname}</span>
          <span className={styles.muted}>{idLine}</span>
          <span className={styles.status}>
            <span className={account.sessionValid ? styles.dotValid : styles.dotExpired} aria-hidden="true" />
            <span className={account.sessionValid ? styles.valid : styles.expired}>
              {account.sessionValid ? "会话有效" : "登录已过期"}
            </span>
            <span className={styles.muted}>
              · {loginMethodLabels[account.loginMethod]} · {verifiedAt} 已验证
            </span>
          </span>
        </div>
      </div>
      <div className={styles.actions}>
        <Button onClick={onVerify}>重新验证</Button>
        <Button onClick={onOpenConsole}>打开开发者后台</Button>
        <TextButton tone="danger" className={styles.logout} onClick={onLogout}>
          退出登录
        </TextButton>
      </div>
    </Panel>
  );
}
