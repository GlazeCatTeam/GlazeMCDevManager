import {
  type AccountSummary,
  Button,
  callHost,
  Dialog,
  EmptyState,
  Icon,
  Notice,
  PageHeader,
  useNavigation,
  useSession,
} from "@glaze/plugin-sdk";
import { useCallback, useState } from "react";
import styles from "./AccountPage.module.css";
import { routes } from "./routes";
import { CurrentAccountCard } from "./widgets/CurrentAccountCard";
import { LevelCard } from "./widgets/LevelCard";
import { SavedAccountsCard } from "./widgets/SavedAccountsCard";
import { SessionSecurityCard } from "./widgets/SessionSecurityCard";

const DEVELOPER_CONSOLE_URL = "https://mcdev.webapp.163.com/";

/** Account management page; a fixed arrangement for now, moved onto the layout grid in M1 */
export function AccountPage() {
  const { navigate } = useNavigation();
  const { current, accounts } = useSession();
  const [pendingDelete, setPendingDelete] = useState<AccountSummary | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeDelete = useCallback(() => setPendingDelete(null), []);

  /** Re-check the current session with NetEase */
  const verify = async () => {
    setError(null);
    setVerifying(true);
    const result = await callHost("account.verify");
    setVerifying(false);
    if (!result.ok) {
      setError(result.error.message);
    }
  };

  /** Verify another account and make it current; the current one stays if that fails */
  const switchTo = async (id: string) => {
    setError(null);
    setSwitchingId(id);
    const result = await callHost("account.switch", { id });
    setSwitchingId(null);
    if (!result.ok) {
      setError(`切换失败：${result.error.message}`);
    }
  };

  /** Delete the confirmed account and its saved session */
  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    const result = await callHost("account.remove", { id: pendingDelete.id });
    setPendingDelete(null);
    if (!result.ok) {
      setError(result.error.message);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="账号管理"
        subtitle="切换账号后，所有模块都会使用该账号的会话"
        actions={
          <Button variant="primary" onClick={() => navigate(routes.login)}>
            <Icon name="action.add" size={14} />
            添加账号
          </Button>
        }
      />
      {error && <Notice>{error}</Notice>}

      <div className={styles.columns}>
        <div className={styles.column}>
          {current ? (
            <>
              <CurrentAccountCard
                className={styles.current}
                account={current}
                verifying={verifying}
                onVerify={verify}
                onOpenConsole={() => window.open(DEVELOPER_CONSOLE_URL)}
                onLogout={() => void callHost("account.logout")}
              />
              <LevelCard key={current.id} className={styles.level} accountId={current.id} />
            </>
          ) : (
            <EmptyState title="尚未登录账号" hint="添加新账号，或从已保存账号中选择一个登录" />
          )}
        </div>
        <div className={styles.column}>
          <SavedAccountsCard
            className={styles.saved}
            accounts={accounts}
            switchingId={switchingId}
            onSwitch={switchTo}
            onRelogin={(id) => navigate(routes.loginExpired, { id })}
            onDelete={setPendingDelete}
            onAdd={() => navigate(routes.login)}
          />
          <SessionSecurityCard className={styles.security} />
        </div>
      </div>

      {pendingDelete && (
        <Dialog
          title="删除这个账号？"
          onClose={closeDelete}
          actions={
            <>
              <Button onClick={closeDelete}>取消</Button>
              <Button variant="danger" onClick={confirmDelete}>
                删除
              </Button>
            </>
          }
        >
          「{pendingDelete.nickname}」在本机加密保存的会话会一并清除，之后需要重新登录。
        </Dialog>
      )}
    </div>
  );
}
