import { AppLogo, Icon } from "@glaze/ui";
import { useEffect, useState } from "react";
import styles from "./TitleBar.module.css";

/** Frameless window title bar with drag area and window controls */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.glaze.rpc("window.getState").then((result) => {
      if (result.ok) {
        setMaximized(result.value.maximized);
      }
    });
    return window.glaze.on("window.stateChanged", (state) => setMaximized(state.maximized));
  }, []);

  return (
    <header className={styles.bar}>
      <AppLogo size={18} />
      <span className={styles.title}>Glaze MC Dev Manager</span>
      <div className={styles.spacer} />
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          aria-label="最小化"
          onClick={() => void window.glaze.rpc("window.minimize")}
        >
          <Icon name="window.minimize" />
        </button>
        <button
          type="button"
          className={styles.control}
          aria-label={maximized ? "还原" : "最大化"}
          onClick={() => void window.glaze.rpc("window.toggleMaximize")}
        >
          <Icon name={maximized ? "window.restore" : "window.maximize"} />
        </button>
        <button
          type="button"
          className={`${styles.control} ${styles.close}`}
          aria-label="关闭"
          onClick={() => void window.glaze.rpc("window.close")}
        >
          <Icon name="window.close" />
        </button>
      </div>
    </header>
  );
}
