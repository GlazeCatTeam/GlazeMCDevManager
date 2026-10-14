import { useMemo, useState } from "react";
import { currentAccount } from "../mock/session";
import { RouteView } from "../routes/pages";
import styles from "./AppShell.module.css";
import { loadNavEntries } from "./nav";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";

/** Workbench frame: title bar, side navigation and the active page */
export function AppShell() {
  const entries = useMemo(loadNavEntries, []);
  const [activeRoute, setActiveRoute] = useState(entries.find((e) => e.group === "top")?.route ?? "");
  const activeEntry = entries.find((e) => e.route === activeRoute);

  return (
    <div className={styles.shell}>
      <TitleBar />
      <div className={styles.body}>
        <Sidebar entries={entries} activeRoute={activeRoute} account={currentAccount} onNavigate={setActiveRoute} />
        <main className={styles.main}>
          <RouteView route={activeRoute} title={activeEntry?.title ?? ""} />
        </main>
      </div>
    </div>
  );
}
