import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppearanceProvider, useAppearance } from "../../apps/desktop/src/renderer/shell/Appearance";
import { defaultAppearance, defaultRankingBoards, type GlazeBridge } from "../../packages/contracts/src";
import { NavigationProvider, SessionProvider } from "../../packages/plugin-sdk/src";
import { RankingCard } from "../../plugins/home/src/widgets/RankingCard";
import { SettingsPage } from "../../plugins/settings/src/SettingsPage";
import "../../apps/desktop/src/renderer/global.css";

const listeners = new Map<string, Set<(value: never) => void>>();
let failWrites = false;

/** Browser-only host stand-in; real SQLite persistence is covered by appearance.test.ts */
const rpc: GlazeBridge["rpc"] = async (method, params) => {
  await new Promise((resolve) => setTimeout(resolve, 40));
  if (failWrites && (method.endsWith(".set") || method === "layout.setRanking" || method === "layout.reset")) {
    return { ok: false, error: { kind: "internal", message: "测试：磁盘不可写" } };
  }
  let value: unknown;
  let event: string | undefined;
  if (method === "appearance.get")
    value = JSON.parse(localStorage.getItem("fixture.appearance") ?? "null") ?? defaultAppearance;
  else if (method === "appearance.set") {
    localStorage.setItem("fixture.appearance", JSON.stringify(params));
    value = params;
    event = "appearance.changed";
  } else if (method === "layout.getRanking")
    value = JSON.parse(localStorage.getItem("fixture.layout") ?? "null") ?? defaultRankingBoards;
  else if (method === "layout.setRanking" || method === "layout.reset") {
    value = method === "layout.reset" ? [...defaultRankingBoards] : params;
    localStorage.setItem("fixture.layout", JSON.stringify(value));
    event = "layout.rankingChanged";
  } else if (method === "rank.list") value = [];
  else return { ok: false, error: { kind: "fixture", message: `未模拟 ${method}` } };
  if (event) for (const listener of listeners.get(event) ?? []) listener(value as never);
  return { ok: true, value } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
};

const bridge: GlazeBridge = {
  rpc,
  on(event, listener) {
    const handlers = listeners.get(event) ?? new Set();
    handlers.add(listener);
    listeners.set(event, handlers);
    return () => handlers.delete(listener);
  },
};
Object.assign(globalThis, { glaze: bridge });

/** Show the production settings, theme provider and home layout controls with fault injection */
function Preview() {
  const { appearance, setAppearance, saving, status } = useAppearance();
  const [failed, setFailed] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  return (
    <NavigationProvider value={{ route: "glaze.settings/settings", params: {}, navigate: () => {} }}>
      <SessionProvider value={{ current: null, accounts: [] }}>
        <label>
          <input
            type="checkbox"
            checked={failed}
            onChange={(event) => {
              failWrites = event.target.checked;
              setFailed(failWrites);
            }}
          />
          模拟写入失败
        </label>
        <button type="button" onClick={() => setShowSettings((value) => !value)}>
          切换页面
        </button>
        {showSettings ? (
          <SettingsPage
            appearance={appearance}
            onAppearanceChange={setAppearance}
            appearanceSaving={saving}
            appearanceStatus={status}
          />
        ) : (
          <RankingCard onOpenAll={() => {}} />
        )}
      </SessionProvider>
    </NavigationProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing fixture root");
createRoot(container).render(
  <StrictMode>
    <AppearanceProvider>
      <Preview />
    </AppearanceProvider>
  </StrictMode>,
);
