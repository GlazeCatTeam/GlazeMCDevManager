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
import { monthDay } from "../format";
import styles from "./SavedAccountsCard.module.css";

export interface SavedAccountsCardProps {
  accounts: AccountSummary[];
  /** Account being switched to, while the switch is verified */
  switchingId: string | null;
  onSwitch: (id: string) => void;
  onRelogin: (id: string) => void;
  onDelete: (account: AccountSummary) => void;
  onAdd: () => void;
  className?: string | undefined;
}

/** Second line under a saved account's name */
function subtitle(account: AccountSummary): string {
  const method = loginMethodLabels[account.loginMethod];
  return account.current ? method : `${method} · ${monthDay(account.lastLoginAt)} 登录`;
}

/** Every account saved on this machine, with switch, re-login and delete actions */
export function SavedAccountsCard({
  accounts,
  switchingId,
  onSwitch,
  onRelogin,
  onDelete,
  onAdd,
  className,
}: SavedAccountsCardProps) {
  return (
    <Panel aria-label="已保存账号" title="已保存账号" className={className}>
      <ul className={styles.list}>
        {accounts.map((account) => {
          const expired = account.status === "expired";
          return (
            <li key={account.id} className={styles.row}>
              <Avatar src={remoteImageUrl(account.avatarUrl)} colors={avatarColorsFor(account.id)} size={40} />
              <span className={styles.text}>
                <span className={styles.nickname}>{account.nickname}</span>
                {expired ? (
                  <span className={styles.expired}>登录已过期</span>
                ) : (
                  <span className={styles.muted}>{subtitle(account)}</span>
                )}
              </span>
              {account.current ? (
                <span className={styles.current}>当前使用</span>
              ) : (
                <>
                  {expired ? (
                    <Button size="sm" onClick={() => onRelogin(account.id)}>
                      重新登录
                    </Button>
                  ) : (
                    <Button size="sm" disabled={switchingId !== null} onClick={() => onSwitch(account.id)}>
                      {switchingId === account.id ? "验证中…" : "切换"}
                    </Button>
                  )}
                  <TextButton
                    tone="danger"
                    className={styles.delete}
                    aria-label={`删除 ${account.nickname}`}
                    onClick={() => onDelete(account)}
                  >
                    删除
                  </TextButton>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {accounts.length === 1 ? (
        <div className={styles.single}>
          <span className={styles.muted}>只登录了一个账号。添加第二个账号后，可以在这里一键切换。</span>
          <TextButton onClick={onAdd}>添加账号</TextButton>
        </div>
      ) : (
        <span className={styles.note}>切换时先验证目标账号，失败会回到当前账号。</span>
      )}
    </Panel>
  );
}
