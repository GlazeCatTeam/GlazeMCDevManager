import { type Navigation, NavigationProvider, type RouteParams } from "@glaze/plugin-sdk";
import { useMemo, useState } from "react";
import { currentAccount, startup } from "../mock/session";
import { RouteView } from "../routes/pages";
import styles from "./AppShell.module.css";
import { loadNavEntries, loadPages } from "./nav";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";

interface Location {
  route: string;
  params: RouteParams;
}

/** Workbench frame: title bar, side navigation and the active page; chrome-less pages fill the window */
export function AppShell() {
  const entries = useMemo(loadNavEntries, []);
  const pages = useMemo(loadPages, []);
  // TODO: the initial route comes from app.getInitialRoute() once the session manager exists (M2)
  const [location, setLocation] = useState<Location>(
    () => startup ?? { route: entries.find((e) => e.group === "top")?.route ?? "", params: {} },
  );

  const navigation = useMemo<Navigation>(
    () => ({ ...location, navigate: (route, params = {}) => setLocation({ route, params }) }),
    [location],
  );

  const page = pages.get(location.route);
  const title = page?.title ?? "";

  return (
    <NavigationProvider value={navigation}>
      <div className={styles.shell}>
        <TitleBar />
        {page?.chrome === "none" ? (
          <main key={location.route} className={styles.bare}>
            <RouteView route={location.route} title={title} />
          </main>
        ) : (
          <div className={styles.body}>
            <Sidebar
              entries={entries}
              activeRoute={location.route}
              account={currentAccount}
              onNavigate={(route) => navigation.navigate(route)}
            />
            <main key={location.route} className={styles.main}>
              <RouteView route={location.route} title={title} />
            </main>
          </div>
        )}
      </div>
    </NavigationProvider>
  );
}
