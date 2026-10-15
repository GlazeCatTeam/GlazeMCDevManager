import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { estimateIncome } from "../packages/netease/src/income/estimate";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "income-test-session" };

afterEach(() => {
  globalThis.fetch = originalFetch;
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
    assert.deepEqual(queried, ["/data_analysis/day_detail/", "/data_analysis/goods/day_detail/"]);
  }
});
