import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { estimateIncome } from "../packages/netease/src/income/estimate";
import { estimateProfit } from "../packages/netease/src/income/rules";
import { estimatePePeriodProfit } from "../packages/netease/src/income/period-rules";
import { allocatePePeriodIncome } from "../packages/netease/src/income/period-allocation";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "income-test-session" };

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("account allocations preserve every cent and apply award caps and taxes only once", () => {
  const cases = [[50000, 50000], [100000, 100000, 100000, 100000], [0, 0], [1, 1, 1], [12345.67, 88888.88, 123456.78, 0], [1000000, 1000000, 1000000, 1000000], [3000000, 3000000, 3000000, 3000000], [50_000_000]];
  for (const amounts of cases) for (const cost of [0, .3, .3406915224819656, 1]) {
    const rows = amounts.map((diamonds, i) => ({ resourceId: String(i), name: `work ${i}`, diamonds }));
    const result = allocatePePeriodIncome(rows, cost);
    const money = (n: number) => Math.round(n * 100);
    for (const key of ["developerShareYuan", "subsidyYuan", "totalYuan", "taxYuan", "afterTaxYuan"] as const)
      assert.equal(result.allocations.reduce((s, r) => s + money(r[key]), 0), money(result[key]));
    for (const row of result.allocations) {
      assert.equal(money(row.developerShareYuan) + money(row.subsidyYuan), money(row.totalYuan));
      assert.equal(money(row.totalYuan) - money(row.taxYuan), money(row.afterTaxYuan));
      assert.ok(row.afterTaxYuan >= 0);
      if (!row.diamonds) assert.equal(row.totalYuan, 0);
    }
    assert.deepEqual(allocatePePeriodIncome([...rows].reverse(), cost), result);
    assert.equal(money(result.totalYuan), money(estimatePePeriodProfit(amounts, cost).totalYuan));
  }
  const four = allocatePePeriodIncome(["a", "b", "c", "d"].map(resourceId => ({ resourceId, name: resourceId, diamonds: 100000 })), .34);
  assert.equal(four.totalYuan, 2148);
  assert.equal(four.afterTaxYuan, 1878.4);
  assert.deepEqual(four.allocations.map(r => r.subsidyYuan), [232, 232, 232, 132]);
  assert.equal(estimatePePeriodProfit([100000], .34).afterTaxYuan * 4, 2512);
});

test("home estimates query calendar months for ordinary works and lobby goods and display the same dates", async () => {
  for (const [month, lastDay] of [
    ["2026-10", "31"],
    ["2026-09", "30"],
    ["2026-02", "28"],
    ["2024-02", "29"],
    ["2026-01", "31"],
    ["2025-12", "31"],
  ]) {
    const queried: string[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      let data: unknown;
      switch (url.pathname) {
        case "/items/categories/pe/":
          data = { item: [{ item_id: "work-1", item_name: "Work", create_time: "2024-01-01" }] };
          break;
        case "/goods/pe/summary":
          data = { items: [{ item_id: "lobby-1" }] };
          break;
        case "/goods/pe/lobby-1/":
          data = { goods: [{ goods_id: "good-1" }] };
          break;
        default:
          assert.ok(["/data_analysis/day_detail/", "/data_analysis/goods/day_detail/"].includes(url.pathname));
          assert.equal(url.searchParams.get("start_date"), `${month.replace("-", "")}01`);
          assert.equal(url.searchParams.get("end_date"), `${month.replace("-", "")}${lastDay}`);
          queried.push(url.pathname);
          data = { data: [{ iid: url.pathname.includes("goods") ? "good-1" : "work-1", diamond: 100 }] };
      }
      return new Response(JSON.stringify({ status: "ok", data }));
    };
    const result = await estimateIncome(session, month);
    assert.ok(result.ok);
    assert.equal(result.value.startDate, `${month}-01`);
    assert.equal(result.value.endDate, `${month}-${lastDay}`);
    assert.equal(result.value.diamonds, 200);
    assert.equal(result.value.totalYuan, 1.05);
    assert.equal(result.value.source, undefined);
    assert.deepEqual(queried, ["/data_analysis/day_detail/", "/data_analysis/goods/day_detail/"]);
  }
});

test("period candidate changes neither homepage proportional incentives nor flat bonus tiers", () => {
  assert.equal(estimateProfit([200]).totalYuan, 1.05);
  assert.equal(estimatePePeriodProfit([200], 0.3).totalYuan, 1.4);
  const candidate = estimatePePeriodProfit([300000, 100000], 0.34);
  assert.ok(Math.abs(candidate.afterTaxYuan - 1798.4) < 0.001);
  assert.equal(estimatePePeriodProfit([50_000_000], 0.3).subsidyYuan, 0);
  assert.equal(estimatePePeriodProfit([100000, 100000, 100000, 100000], 1).subsidyYuan, 300);
  for (const rate of [-0.1, 1.1, Number.NaN]) assert.throws(() => estimatePePeriodProfit([100], rate));
});
