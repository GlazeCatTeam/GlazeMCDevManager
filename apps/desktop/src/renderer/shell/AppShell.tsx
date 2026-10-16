import { AccessRequestDialog } from "@glaze/plugin-assistant";
import {
  Button,
  callHost,
  isRestorableRoute,
  type Navigation,
  NavigationProvider,
  Notice,
  onHostEvent,
  type RouteParams,
  type Session,
  SessionProvider,
  usePluginRegistry,
} from "@glaze/plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import { RouteView } from "../routes/pages";
import styles from "./AppShell.module.css";
import { loadNavEntries, loadPages } from "./nav";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";

interface Location {
  route: string;
  params: RouteParams;
}

const loginRoute = "glaze.account/login";
const loginExpiredRoute = "glaze.account/login-expired";
const authRoutes = new Set([loginRoute, loginExpiredRoute]);
const publicRoutes = new Set([...authRoutes, "glaze.settings/settings", "glaze.account/account"]);

/** Workbench frame: title bar, side navigation and the active page; chrome-less pages fill the window */
export function AppShell() {
  const registry = usePluginRegistry();
  const pluginStates = registry?.snapshot?.plugins;
  const entries = useMemo(loadNavEntries, []);
  const pages = useMemo(loadPages, []);
  const [location, setLocation] = useState<Location | null>(null);
  const [session, setSession] = useState<Session>({ current: null, accounts: [] });
  const worksEnabled = pluginStates?.find((item) => item.id === "glaze.works")?.enabled ?? !registry;

  // Background preparation belongs to the enabled plugin lifecycle, not module import side effects
  useEffect(() => {
    if (!worksEnabled) return;
    let active = true;
    let dispose: (() => void) | undefined;
    void import("@glaze/plugin-works")
      .then((plugin) => {
        if (active) dispose = plugin.startWorksWarmup();
      })
      .catch(() => {
        void callHost("app.reportRendererError", { kind: "error" }).catch(() => {});
      });
    return () => {
      active = false;
      dispose?.();
    };
  }, [worksEnabled]);

  // First page and accounts come from the main process; account changes are pushed afterwards
  useEffect(() => {
    let alive = true;
    const unsubscribe = onHostEvent("account.changed", setSession);
    void Promise.all([callHost("app.getInitialRoute"), callHost("account.list")]).then(([route, list]) => {
      if (!alive) {
        return;
      }
      const accounts = list.ok ? list.value : [];
      setSession({ accounts, current: accounts.find((account) => account.current) ?? null });
      setLocation(route.ok ? route.value : { route: loginRoute, params: {} });
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  // Leave the workbench when the current account signs out or its session expires
  const { current } = session;
  useEffect(() => {
    if (!location || publicRoutes.has(location.route)) {
      return;
    }
    if (!current) {
      setLocation({ route: loginRoute, params: {} });
    } else if (current.status === "expired") {
      setLocation({ route: loginExpiredRoute, params: { id: current.id } });
    }
  }, [current, location]);

  // Remember only page roots while authenticated, leaving editor parameters and login flows out
  useEffect(() => {
    if (!location || !current || current.status === "expired" || !isRestorableRoute(location.route)) return;
    void callHost("app.rememberRoute", { route: location.route }).catch(() => {});
  }, [location, current]);

  const navigation = useMemo<Navigation | null>(
    () => location && { ...location, navigate: (route, params = {}) => setLocation({ route, params }) },
    [location],
  );

  if (!location || !navigation || (registry && !registry.snapshot)) {
    return (
      <div className={styles.shell}>
        <TitleBar />
        {registry?.error && (
          <Notice action={<Button onClick={registry.refresh}>重试插件加载</Button>}>{registry.error}</Notice>
        )}
      </div>
    );
  }

  const page = pages.get(location.route);
  const title = page?.title ?? "";

  return (
    <NavigationProvider value={navigation}>
      <SessionProvider value={session}>
        <div className={styles.shell}>
          <TitleBar />
          {page?.chrome === "none" ? (
            <main key={location.route} className={styles.bare}>
              <RouteView route={location.route} title={title} />
            </main>
          ) : (
            <div className={styles.body}>
              <Sidebar
                entries={entries.filter(
                  (entry) =>
                    !pluginStates || pluginStates.find((plugin) => plugin.id === entry.route.split("/")[0])?.enabled,
                )}
                activeRoute={location.route}
                account={current}
                onNavigate={(route, params) => navigation.navigate(route, params)}
              />
              <main key={location.route} className={styles.main}>
                <RouteView route={location.route} title={title} />
              </main>
            </div>
          )}
          <AccessRequestDialog />
        </div>
      </SessionProvider>
    </NavigationProvider>
  );
}
