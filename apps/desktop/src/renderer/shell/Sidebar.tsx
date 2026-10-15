import { Icon, PixelAvatar } from "@glaze/ui";
import type { MockAccount } from "../mock/session";
import type { NavEntry } from "./nav";
import styles from "./Sidebar.module.css";

const accountRoute = "glaze.account/account";

export interface SidebarProps {
  entries: NavEntry[];
  activeRoute: string;
  account: MockAccount;
  onNavigate: (route: string) => void;
}

/** Side navigation with the current account card as the account management entry */
export function Sidebar({ entries, activeRoute, account, onNavigate }: SidebarProps) {
  const accountActive = activeRoute === accountRoute;

  const renderItem = (entry: NavEntry) => {
    const active = entry.route === activeRoute;
    return (
      <button
        key={entry.route}
        type="button"
        className={active ? `${styles.item} ${styles.active}` : styles.item}
        aria-current={active ? "page" : undefined}
        onClick={() => onNavigate(entry.route)}
      >
        {entry.icon && <Icon name={entry.icon} size={20} />}
        {entry.title}
      </button>
    );
  };

  return (
    <nav className={styles.sidebar} aria-label="功能导航">
      {entries.filter((e) => e.group === "top").map(renderItem)}
      <div className={styles.spacer} />
      {entries.filter((e) => e.group === "bottom").map(renderItem)}
      <button
        type="button"
        className={accountActive ? `${styles.account} ${styles.active}` : styles.account}
        aria-label={`${account.nickname}，账号管理`}
        aria-current={accountActive ? "page" : undefined}
        title="账号管理"
        onClick={() => onNavigate(accountRoute)}
      >
        <PixelAvatar colors={account.avatar} size={28} />
        <span className={styles.accountText}>
          <span className={styles.nickname}>{account.nickname}</span>
          <span className={account.sessionValid ? styles.valid : styles.expired}>
            {account.sessionValid ? "会话有效" : "登录已过期"}
          </span>
        </span>
      </button>
    </nav>
  );
}
