import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AccountSummary, GlazeBridge } from "../../packages/contracts/src";
import { readIncomeDetail, readIncomeList } from "../../packages/netease/src/endpoints/income";
import { SessionProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { IncomePage } from "../../plugins/income/src/IncomePage";
import fluentDark from "../../themes/fluent-dark/theme.json";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";

const account: AccountSummary = {
  id: "income-a",
  nickname: "收益测试",
  passport: null,
  avatarUrl: null,
  loginMethod: "window",
  status: "active",
  lastLoginAt: 0,
  current: true,
};
const records = Array.from({ length: 16 }, (_, index) => ({
  _id: `income-${index}`,
  data_month: `${index < 10 ? "2026" : "2025"}-${String(index < 10 ? 10 - index : 22 - index).padStart(2, "0")}`,
  platform: "pe",
  status: ["init", "pay_success", "applying", "fail", "need_modify", "pay_fail", "new_status"][index % 7],
  income: index === 2 ? null : "12680.25",
  tax: "1200.00",
  tech_service_fee: 10.25,
  total_usage_price: 0,
  incentive_income: "260.00",
  play_plan_income: "20.00",
  available_income: "24000.00",
  available_detail: [{ data_month: "202609", income: "1000.00" }],
  total_diamond: 126802,
}));
let failure = false;
let calls = 0;

/** Replace only host I/O; production adapters, page, account boundaries and query lifecycle still run */
const rpc: GlazeBridge["rpc"] = async (method, params) => {
  const shouldFail = failure;
  const query = params as { account: string; platform?: string; id?: string };
  calls++;
  const counter = document.getElementById("calls");
  if (counter) counter.textContent = String(calls);
  await new Promise((resolve) => setTimeout(resolve, query.account === account.id ? 350 : 40));
  if (shouldFail) return { ok: false, error: { kind: "network", message: "离线测试失败" } };
  const value =
    method === "income.list"
      ? readIncomeList(
          {
            count: query.account === account.id && query.platform === "pe" ? records.length : 0,
            incomes: query.account === account.id && query.platform === "pe" ? records : [],
          },
          query.platform === "pe" ? "pe" : "pc",
        )
      : readIncomeDetail(
          records.find((entry) => entry._id === query.id),
          query.id ?? "",
        );
  if (!value.ok) return { ok: false, error: { kind: "parse", message: "测试记录解析失败" } };
  return { ok: true, value: value.value } as Awaited<ReturnType<GlazeBridge["rpc"]>>;
};
window.glaze = { rpc, on: () => () => {} };
applyTheme(oreUi);

/** Expose failure, theme and account controls only on this offline fixture */
function Preview() {
  const [other, setOther] = useState(false);
  const current = { ...account, id: other ? "income-b" : account.id };
  return (
    <>
      <div style={{ padding: 12, display: "flex", gap: 20 }}>
        <label>
          <input
            type="checkbox"
            onChange={(event) => {
              failure = event.target.checked;
            }}
          />
          模拟失败
        </label>
        <button type="button" onClick={() => setOther((value) => !value)}>
          切换测试账号
        </button>
        <button type="button" onClick={() => applyTheme(fluentDark)}>
          深色主题
        </button>
        <span>
          请求数：<span id="calls">0</span>
        </span>
      </div>
      <SessionProvider value={{ current, accounts: [current] }}>
        <IncomePage />
      </SessionProvider>
    </>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
