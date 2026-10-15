import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { IncomeDetail, RpcResult } from "../packages/contracts/src";
import { isIncomeDetailParams, isIncomeListParams } from "../packages/contracts/src/rpc/income";
import {
  getIncomeDetail,
  getIncomeList,
  readIncomeDetail,
  readIncomeList,
} from "../packages/netease/src/endpoints/income";
import { IncomeDetailCache } from "../plugins/income/src/detail-cache";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "income-test-session" };
const record = {
  _id: "income-1",
  data_month: "202609",
  platform: "pe",
  status: "init",
  income: "100.10",
  tax: "10.20",
  tech_service_fee: 0.3,
  total_usage_price: 0,
  available_income: "1000.00",
  incentive_income: "5.00",
  play_plan_income: "0.00",
  total_diamond: 1001,
  available_detail: [{ data_month: "202608", income: "90.00" }],
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("cost references distinguish real zero costs from unavailable legacy fields", () => {
  for (const [fields, expected] of [
    [{ channel_ip_cost: 330, total_diamond: 1000 }, 0.33],
    [{ channel_ip_cost: 0, total_diamond: 1000, sharable_flow: 1000 }, 0],
    [{ channel_ip_cost: 0, total_diamond: 1000, sharable_flow: 0 }, undefined],
    [{ channel_ip_cost: 1001, total_diamond: 1000 }, undefined],
    [{ channel_ip_cost: -1, total_diamond: 1000 }, undefined],
    [{ channel_ip_cost: 0, total_diamond: 0 }, undefined],
  ] as const) {
    const result = readIncomeList({ count: 1, incomes: [{ ...record, ...fields }] }, "pe");
    assert.ok(result.ok);
    assert.equal(result.value.records[0]?.platformCostRate, expected);
  }
});

test("normalizes month, calculates net in cents and never sums cumulative available balances", () => {
  const result = readIncomeList(
    { count: 2, incomes: [record, { ...record, _id: "income-2", data_month: "2026-10", status: "pay_success" }] },
    "pe",
  );
  assert.ok(result.ok);
  assert.equal(result.value.incomeYuan, 200.2);
  assert.equal(result.value.netYuan, 179.2);
  assert.equal(result.value.paidYuan, 89.6);
  assert.equal(result.value.unsettledCount, 1);
  assert.equal(result.value.records[0]?.month, "2026-10");
  assert.equal(result.value.records[0]?.availableYuan, 1000);
  assert.equal("availableYuan" in result.value, false);
});

test("missing amounts remain null while a genuinely empty list has zero totals", () => {
  const result = readIncomeList(
    { count: 1, incomes: [{ ...record, income: null, tax: "", tech_service_fee: undefined }] },
    "pe",
  );
  assert.ok(result.ok);
  assert.equal(result.value.incomeYuan, null);
  assert.equal(result.value.netYuan, null);
  assert.deepEqual(readIncomeList({ count: 0, incomes: [] }, "pc"), {
    ok: true,
    value: { records: [], total: 0, incomeYuan: 0, netYuan: 0, paidYuan: 0, unsettledCount: 0 },
  });
});

test("rejects incomplete lists, duplicates, wrong platforms and malformed rows without leaking payload values", () => {
  const cases = [
    null,
    {},
    { count: 2, incomes: [record] },
    { count: 2, incomes: [record, record] },
    ...[
      { platform: "pc" },
      { data_month: "202613" },
      { _id: "../secret" },
      { income: "private-bank-value" },
      { income: true },
      { income: "1.001" },
      { income: "99999999999999999" },
      { status: null },
      { available_detail: [{}] },
    ].map((patch) => ({ count: 1, incomes: [{ ...record, ...patch }] })),
  ];
  for (const value of cases) {
    const result = readIncomeList(value, "pe");
    assert.ok(!result.ok && result.error.kind === "parse");
    assert.equal(JSON.stringify(result).includes("private-bank-value"), false);
  }
});

test("retains unknown statuses and negative adjustments without reclassifying them", () => {
  const result = readIncomeList(
    { count: 1, incomes: [{ ...record, status: "future_status", income: "-10.00", tax: 0, tech_service_fee: 0 }] },
    "pe",
  );
  assert.ok(result.ok);
  assert.equal(result.value.records[0]?.status, "future_status");
  assert.equal(result.value.netYuan, -10);
  assert.equal(result.value.paidYuan, 0);
  assert.equal(result.value.unsettledCount, 0);
});

test("detail matches its requested identifier and strips bank and identity fields", () => {
  const result = readIncomeDetail(
    {
      ...record,
      _id: undefined,
      id: "income-1",
      bank: "private-bank",
      card_no: "private-card",
      real_name: "private-name",
      developer_urs: "private-account",
      type: "individual_withhold",
      adjust_money: "-1.25",
      extra_info: { adv_income: 2 },
    },
    "income-1",
  );
  assert.ok(result.ok);
  assert.equal(result.value.adjustmentYuan, -1.25);
  assert.equal(result.value.advertisingYuan, 2);
  assert.equal(JSON.stringify(result).includes("private-"), false);
  assert.equal(readIncomeDetail(record, "other").ok, false);
});

test("validates read parameters before network requests", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("unexpected request");
  };
  assert.equal(isIncomeListParams({ platform: "pe" }), true);
  assert.equal(isIncomeListParams({ platform: "pc", account: "" }), false);
  assert.equal(isIncomeDetailParams({ id: "abc_123-456" }), true);
  for (const id of ["", "../users/me", "a?x=1", "a/b", "x".repeat(129)])
    assert.equal(isIncomeDetailParams({ id }), false);
  assert.equal((await getIncomeList(session, { platform: "other" as "pe" })).ok, false);
  assert.equal((await getIncomeDetail(session, { id: "../users" })).ok, false);
  assert.equal(calls, 0);
});

test("uses real list and detail routes with GET and the existing session transport", async () => {
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("Cookie"), "NTES_SESS=income-test-session");
    if (url.pathname === "/incomes") {
      assert.equal(url.searchParams.get("platform"), "pe");
      assert.equal(url.searchParams.get("start"), "0");
      assert.equal(url.searchParams.get("span"), "2147483647");
    }
    return new Response(
      JSON.stringify({
        status: "ok",
        data: url.pathname === "/incomes" ? { count: 1, incomes: [record] } : { ...record, id: record._id },
      }),
    );
  };
  assert.ok((await getIncomeList(session, { platform: "pe" })).ok);
  assert.ok((await getIncomeDetail(session, { id: "income-1" })).ok);
  assert.deepEqual(paths, ["/incomes", "/incomes/income-1"]);
});

test("network, session expiry and platform errors remain errors rather than zero income", async () => {
  for (const [reply, expected] of [
    [new Response(JSON.stringify({ status: "no_login" })), "session_expired"],
    [new Response(JSON.stringify({ status: "error", msg: "查询失败" })), "business"],
    [new Response("not-json"), "parse"],
  ] as const) {
    globalThis.fetch = async () => reply;
    const result = await getIncomeList(session, { platform: "pe" });
    assert.ok(!result.ok);
    assert.equal(result.error.kind, expected);
  }
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  const result = await getIncomeDetail(session, { id: "income-1" });
  assert.ok(!result.ok && result.error.kind === "network");
});

test("detail cache coalesces pending reads, reuses successes and refreshes after expiry", async () => {
  const detail = readIncomeDetail(record, "income-1");
  assert.ok(detail.ok);
  let calls = 0;
  let now = 0;
  const cache = new IncomeDetailCache(
    async () => {
      calls++;
      return detail;
    },
    () => now,
  );
  const first = cache.read("income-1");
  assert.equal(cache.read("income-1"), first);
  await first;
  await cache.read("income-1");
  assert.equal(calls, 1);
  assert.equal(cache.peek("income-1"), detail.value);
  now = 60_001;
  assert.equal(cache.fresh("income-1"), false);
  assert.equal(cache.peek("income-1"), detail.value);
  await cache.read("income-1");
  assert.equal(calls, 2);
});

test("refresh discards old in-flight results but retains the last successful detail", async () => {
  const detail = readIncomeDetail(record, "income-1");
  assert.ok(detail.ok);
  const resolvers: ((result: RpcResult<IncomeDetail>) => void)[] = [];
  const cache = new IncomeDetailCache(() => new Promise((resolve) => resolvers.push(resolve)));
  const first = cache.read("income-1");
  await Promise.resolve();
  cache.invalidate();
  const second = cache.read("income-1");
  await Promise.resolve();
  const updated = { ...detail.value, netYuan: 42 };
  resolvers[1]?.({ ok: true, value: updated });
  await second;
  resolvers[0]?.(detail);
  await first;
  assert.equal(cache.peek("income-1")?.netYuan, 42);
  cache.invalidate("income-1");
  assert.equal(cache.peek("income-1")?.netYuan, 42);
  assert.equal(cache.fresh("income-1"), false);
});

test("failed details can retry and page-local caches cannot share another account's results", async () => {
  const detail = readIncomeDetail(record, "income-1");
  assert.ok(detail.ok);
  let calls = 0;
  const cache = new IncomeDetailCache(async () => {
    calls++;
    if (calls === 1) throw new Error("offline");
    return detail;
  });
  assert.equal((await cache.read("income-1")).ok, false);
  assert.equal(cache.fresh("income-1"), false);
  assert.equal((await cache.read("income-1")).ok, true);
  const other = new IncomeDetailCache(async () => detail);
  assert.equal(other.peek("income-1"), null);
  for (let index = 0; index < 24; index++) await cache.read(`other-${index}`);
  assert.equal(cache.peek("income-1"), null);
});
