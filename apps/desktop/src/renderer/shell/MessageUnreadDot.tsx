import { useHostQuery } from "@glaze/plugin-sdk";
import { useEffect } from "react";
import styles from "./MessageUnreadDot.module.css";

/** Keep the current account's unread indicator in sync with writes and incoming messages */
export function MessageUnreadDot({ account }: { account: string }) {
  const { data, reload } = useHostQuery("messages.unreadCount", { account }, { keepPrevious: false });

  useEffect(() => {
    /** Check for new messages while visible and whenever the user returns to the app */
    const refresh = () => {
      if (document.visibilityState === "visible") reload();
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reload]);

  return data !== null && data > 0 ? (
    <span className={styles.dot} role="img" aria-label={`${data} 条未读消息`} title={`${data} 条未读消息`} />
  ) : null;
}
