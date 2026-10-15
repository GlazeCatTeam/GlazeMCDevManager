import { Button, Panel, PixelAvatar, TextButton } from "@glaze/plugin-sdk";
import { loginMethodLabels, type SavedAccount } from "../mock";
import styles from "./SavedAccountsCard.module.css";

export interface SavedAccountsCardProps {
  accounts: SavedAccount[];
  currentUid: string;
  onSwitch: (uid: string) => void;
  onRelogin: (uid: string) => void;
  onDelete: (account: SavedAccount) => void;
  onAdd: () => void;
  className?: string | undefined;
}

/** Second line under a saved account's name */
function subtitle(account: SavedAccount, current: boolean): string {
  const method = loginMethodLabels[account.loginMethod];
  return current ? method : `${method} · ${account.lastLoginAt} 登录`;
}

/** Every account saved on this machine, with switch, re-login and delete actions */
export function SavedAccountsCard({
  accounts,
  currentUid,
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
          const current = account.uid === currentUid;
          return (
            <li key={account.uid} className={styles.row}>
              <PixelAvatar colors={account.avatar} size={40} />
              <span className={styles.text}>
                <span className={styles.nickname}>{account.nickname}</span>
                {account.sessionValid ? (
                  <span className={styles.muted}>{subtitle(account, current)}</span>
                ) : (
                  <span className={styles.expired}>登录已过期</span>
                )}
              </span>
              {current ? (
                <span className={styles.current}>当前使用</span>
              ) : (
                <>
                  {account.sessionValid ? (
                    <Button size="sm" onClick={() => onSwitch(account.uid)}>
                      切换
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => onRelogin(account.uid)}>
                      重新登录
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
