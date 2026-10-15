import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  type AccountSummary,
  defaultRankingBoards,
  type GlazeBridge,
  type RankPageParams,
} from "../../packages/contracts/src";
import { SessionProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { RankingCard } from "../../plugins/home/src/widgets/RankingCard";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";

const account: AccountSummary = {
  id: "a",
  nickname: "Test",
  passport: null,
  avatarUrl: null,
  loginMethod: "window",
  status: "active",
  lastLoginAt: 0,
  current: true,
};
const calls: string[] = [];
const controls = { fail: false, delay: 250 };
Object.assign(globalThis, { rankTest: { calls, controls } });

/** Capture query inputs before delay to reproduce out-of-order responses and failed refreshes */
const rpc: GlazeBridge["rpc"] = async (method, input) => {
  if (method === "layout.getRanking")
    return { ok: true, value: defaultRankingBoards } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
  if (method !== "rank.page") throw new Error(`Unexpected ${method}`);
  const params = input as RankPageParams;
  const key = `${params.account}:${params.board}:${params.category}`;
  calls.push(key);
  const failed = controls.fail;
  await new Promise((resolve) => setTimeout(resolve, controls.delay));
  if (failed) return { ok: false, error: { kind: "network", message: "测试网络失败" } };
  const start = params.start ?? 0;
  const total = params.category === "lobby" ? 0 : 123;
  const items =
    params.category === "lobby"
      ? []
      : Array.from({ length: Math.min(params.limit ?? 50, total - start) }, (_, index) => ({
          rank: start + index + 1,
          itemId: params.board === "hot_search" ? null : `${key}:${start + index}`,
          title: `${key}:work-${start + index}`,
          iconUrl: null,
          change: { kind: "flat" },
        }));
  const value = { items, total, nextStart: start + items.length < total ? start + items.length : null };
  return { ok: true, value } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
};
Object.assign(globalThis, { glaze: { rpc, on: () => () => {} } satisfies GlazeBridge });
applyTheme(oreUi, "dark");

/** Exercise the production ranking under remounts, account switches and theme changes */
function Preview() {
  const [id, setId] = useState("a");
  const [shown, setShown] = useState(true);
  return (
    <SessionProvider value={{ current: { ...account, id }, accounts: [] }}>
      <button type="button" onClick={() => setId(id === "a" ? "b" : "a")}>
        切换测试账号
      </button>
      <button type="button" onClick={() => setShown(!shown)}>
        切换页面
      </button>
      <button type="button" onClick={() => applyTheme(oreUi, "light")}>
        浅色主题
      </button>
      <div style={{ width: "min(480px, 100%)", height: 560, padding: 12 }}>{shown && <RankingCard />}</div>
      <style>{'[aria-label="排行榜"] {height: 560px}'}</style>
    </SessionProvider>
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Preview />
    </StrictMode>,
  );
