import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AccountSummary, DeveloperLevel, GlazeBridge } from "../../packages/contracts/src";
import { NavigationProvider, SessionProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { AccountPage } from "../../plugins/account/src/AccountPage";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";

const account: AccountSummary = {
  id: "level-a",
  nickname: "等级测试",
  passport: null,
  avatarUrl: null,
  loginMethod: "window",
  status: "active",
  lastLoginAt: 0,
  current: true,
};
const level: DeveloperLevel = {
  level: 18,
  levelClass: 3,
  expFloor: 10000,
  expCeiling: 14000,
  totalExp: 13000,
  upgradeClassAchieve: true,
  contributionMonth: "2026-09",
  contribution: { score: "1280.5678", rank: 128, grade: 2 },
  netGameContribution: { score: "0", rank: 0, grade: 5 },
};
let failed = false;
let slow = false;
let requests = 0;
let completed = 0;

/** Offline bridge snapshots each response so delayed account A cannot overwrite account B */
const rpc: GlazeBridge["rpc"] = async (method, input) => {
  if (method === "sessionSettings.get")
    return { ok: true, value: { autoLogin: true, notifyOnExpire: true } } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
  if (method !== "developer.level") throw new Error(`Unexpected method: ${method}`);
  const id = (input as { account: string }).account;
  const failure = failed;
  const value: DeveloperLevel =
    id === account.id
      ? level
      : {
          ...level,
          level: 25,
          levelClass: 8,
          expFloor: 14000,
          expCeiling: 14000,
          totalExp: 14000,
          upgradeClassAchieve: false,
          contribution: null,
          netGameContribution: { score: "25.5", rank: 7, grade: 8 },
        };
  requests++;
  await new Promise((resolve) => setTimeout(resolve, slow ? 1000 : 100));
  completed++;
  if (failure) return { ok: false, error: { kind: "network", message: "离线测试网络失败" } };
  return { ok: true, value } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
};
Object.assign(globalThis, {
  glaze: { rpc, on: () => () => {} },
  levelTest: { requests: () => requests, completed: () => completed },
});
applyTheme(oreUi);

/** Exercise the production account page using fake session changes and read failures */
function Preview() {
  const [current, setCurrent] = useState<AccountSummary | null>(account);
  return (
    <NavigationProvider value={{ route: "glaze.account/account", params: {}, navigate: () => {} }}>
      <SessionProvider value={{ current, accounts: current ? [current] : [] }}>
        <div style={{ display: "flex", gap: 16, padding: 12 }}>
          <label>
            <input
              type="checkbox"
              onChange={(event) => {
                failed = event.target.checked;
              }}
            />
            读取失败
          </label>
          <label>
            <input
              type="checkbox"
              onChange={(event) => {
                slow = event.target.checked;
              }}
            />
            延迟响应
          </label>
          <button type="button" onClick={() => setCurrent(account)}>
            账号 A
          </button>
          <button type="button" onClick={() => setCurrent({ ...account, id: "level-b" })}>
            账号 B
          </button>
          <button type="button" onClick={() => setCurrent(null)}>
            退出测试账号
          </button>
        </div>
        <AccountPage />
      </SessionProvider>
    </NavigationProvider>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing preview root");
createRoot(container).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
