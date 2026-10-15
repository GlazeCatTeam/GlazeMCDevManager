import { Button, Dialog, Icon, PageHeader, useNavigation } from "@glaze/plugin-sdk";
import { useCallback, useState } from "react";
import styles from "./AccountPage.module.css";
import {
  initialCurrentUid,
  initialSettings,
  initialVerifiedAt,
  levelInfo,
  accounts as mockAccounts,
  type SavedAccount,
} from "./mock";
import { routes } from "./routes";
import { CurrentAccountCard } from "./widgets/CurrentAccountCard";
import { LevelCard } from "./widgets/LevelCard";
import { SavedAccountsCard } from "./widgets/SavedAccountsCard";
import { SessionSecurityCard } from "./widgets/SessionSecurityCard";

// Actions that need the session manager or navigation are no-ops for now
const noop = () => {};

/** Current time as HH:MM, used for the mock "verified at" stamp */
function nowHHMM(): string {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Account management page; a fixed arrangement for now, moved onto the layout grid in M1 */
export function AccountPage() {
  const { navigate } = useNavigation();
  const [accounts, setAccounts] = useState<SavedAccount[]>(mockAccounts);
  const [currentUid, setCurrentUid] = useState(initialCurrentUid);
  const [verifiedAt, setVerifiedAt] = useState(initialVerifiedAt);
  const [settings, setSettings] = useState(initialSettings);
  const [pendingDelete, setPendingDelete] = useState<SavedAccount | null>(null);
  const closeDelete = useCallback(() => setPendingDelete(null), []);

  const current = accounts.find((account) => account.uid === currentUid);

  const switchTo = (uid: string) => {
    // Mock switch always succeeds; the real one verifies first and rolls back on failure
    setCurrentUid(uid);
    setVerifiedAt(nowHHMM());
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      setAccounts((list) => list.filter((account) => account.uid !== pendingDelete.uid));
    }
    setPendingDelete(null);
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

      <div className={styles.columns}>
        <div className={styles.column}>
          {current && (
            <CurrentAccountCard
              className={styles.current}
              account={current}
              verifiedAt={verifiedAt}
              onVerify={() => setVerifiedAt(nowHHMM())}
              onOpenConsole={noop}
              onLogout={() => navigate(routes.login)}
            />
          )}
          <LevelCard className={styles.level} info={levelInfo} />
        </div>
        <div className={styles.column}>
          <SavedAccountsCard
            className={styles.saved}
            accounts={accounts}
            currentUid={currentUid}
            onSwitch={switchTo}
            onRelogin={(uid) => navigate(routes.loginExpired, { uid })}
            onDelete={setPendingDelete}
            onAdd={() => navigate(routes.login)}
          />
          <SessionSecurityCard className={styles.security} settings={settings} onChange={setSettings} />
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
          「{pendingDelete.nickname}」在本机保存的会话和密码会一并清除，之后需要重新登录。
        </Dialog>
      )}
    </div>
  );
}
