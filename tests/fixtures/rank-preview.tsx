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
const controls = { fail: false, delay: 250, holdIcons: true, failIcons: false };
const iconCalls: string[][] = [];
const iconResolvers: (() => void)[] = [];
Object.assign(globalThis, {
  rankTest: {
    calls,
    controls,
    iconCalls,
    releaseIcons: () => {
      controls.holdIcons = false;
      for (const resolve of iconResolvers.splice(0)) resolve();
    },
  },
});

/** Capture query inputs before delay to reproduce out-of-order responses and failed refreshes */
const rpc: GlazeBridge["rpc"] = async (method, input) => {
  if (method === "layout.getRanking")
    return { ok: true, value: defaultRankingBoards } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
  if (method === "rank.icons") {
    const { itemIds } = input as { itemIds: string[] };
    iconCalls.push(itemIds);
    if (controls.holdIcons) await new Promise<void>((resolve) => iconResolvers.push(resolve));
    if (controls.failIcons) throw new Error("封面服务暂不可用");
    return {
      ok: true,
      value: Object.fromEntries(itemIds.map((id) => [id, `https://x19.fp.ps.netease.com/file/test-${id}`])),
    } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
  }
  if (method !== "rank.page") throw new Error(`Unexpected ${method}`);
  const params = input as RankPageParams;
  if (params.includeIcons !== false) throw new Error("UI pages must not wait for thumbnails");
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
          itemId:
            params.board === "hot_search"
              ? null
              : `${params.account === "a" ? 1 : 2}${params.board === "pe_hot" ? 1 : params.board === "pe_download" ? 2 : 3}${params.category === "mod" ? 1 : params.category === "map" ? 2 : 3}${String(start + index).padStart(4, "0")}`,
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
