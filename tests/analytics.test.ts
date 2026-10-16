import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setImmediate as nextTick } from "node:timers/promises";
import { isAnalyticsDate, isAnalyticsRange, isAnalyticsResourceIds } from "../packages/contracts/src/rpc/analytics";
import {
  getAnalyticsDaily,
  getAnalyticsMonthly,
  getAnalyticsRealtime,
  readAnalyticsRecords,
  readRealtimeIncome,
} from "../packages/netease/src/endpoints/analytics";
import { getAnalyticsPeriodIncome } from "../packages/netease/src/income/period";
import { runAnalyticsPool } from "../packages/netease/src/endpoints/analytics-pool";
import { listWorks } from "../packages/netease/src/endpoints/works";
import { describeError, fail, ok, type Result } from "../packages/netease/src/errors";
import { getMcDevData } from "../packages/netease/src/http/client";
import {
  aggregate,
  daysInRange,
  formatValue,
  isAnalyzableWork,
  monthsInRange,
  todayKey,
  topResources,
  trackingSeries,
} from "../plugins/analytics/src/data";
import { incomeCycle, periodIncomeYuan, summarizePeriodIncome } from "../plugins/analytics/src/period-income";
import { AnalyticsQueryCache } from "../plugins/analytics/src/query-cache";
import { mergeRealtimeIncome } from "../plugins/analytics/src/realtime-income";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "analytics-test-session" };
const id = "4686664860310207622";
const range = { startDate: "2026-10-01", endDate: "2026-10-14" };
const row = {
  iid: id,
  res_name: "测试资源",
  dateid: "20261001",
  cnt_buy: "12",
  diamond: 100,
  points: 0,
  download_num: 30,
  focus_cnt: 0,
  star_adjusted: 4.2,
  avg_first_type_buy: 10,
  avg_first_type_diamond: 80,
  avg_first_type_focus: 0,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Return the actual platform response envelope, without live network requests */
function response(data: unknown, status = "ok"): Response {
  return new Response(JSON.stringify({ status, data }));
}

test("date and work validators reject overflow, reversed ranges and malformed identifiers", () => {
  assert.equal(isAnalyticsDate("2026-02-29"), false);
  assert.equal(isAnalyticsDate("2024-02-29"), true);
  assert.equal(isAnalyticsRange({ startDate: range.endDate, endDate: range.startDate }), false);
  assert.equal(isAnalyticsRange({ startDate: "2024-01-01", endDate: "2026-01-01" }), false);
  assert.equal(isAnalyticsResourceIds([id, id]), false);
  assert.equal(isAnalyticsResourceIds(["../users/me"]), false);
  assert.equal(isAnalyticsResourceIds([id]), true);
});

test("monthly transport accepts direct and wrapped rows after removing the response envelope", async () => {
  const monthlyRows = [
    { iid: id, monthid: "202610", total_diamond: 125, total_points: 0, download_num: 13 },
    { iid: id, monthid: "202608", total_diamond: 999 },
  ];
  for (const payload of [monthlyRows, { data: monthlyRows }]) {
    globalThis.fetch = async () => response(payload);
    const result = await getAnalyticsMonthly(session, range);
    assert.ok(result.ok);
    assert.equal(result.value.length, 1);
    assert.equal(result.value[0]?.resourceId, id);
    assert.equal(result.value[0]?.date, "2026-10");
    assert.equal(result.value[0]?.diamonds, 125);
    assert.equal(result.value[0]?.emeralds, 0);
    assert.equal(result.value[0]?.purchases, null);
  }
  for (const payload of [[], { data: [] }]) {
    globalThis.fetch = async () => response(payload);
    assert.deepEqual(await getAnalyticsMonthly(session, range), { ok: true, value: [] });
  }
});

test("unknown monthly containers remain errors with value-free structural diagnostics", async () => {
  const cases: [unknown, string][] = [
    [{ private_account_id: "private-response-secret" }, "载荷=对象，data=缺失，data.data=缺失"],
    [{ data: null }, "载荷=对象，data=null，data.data=缺失"],
    [{ data: "private-response-secret" }, "载荷=对象，data=字符串，data.data=缺失"],
    [{ data: { data: [] } }, "载荷=对象，data=对象，data.data=数组(0)"],
  ];
  for (const [payload, shape] of cases) {
    globalThis.fetch = async () => response(payload);
    const result = await getAnalyticsMonthly(session, range);
    assert.ok(!result.ok && result.error.kind === "parse");
    assert.ok(describeError(result.error).includes(shape));
    assert.equal(describeError(result.error).includes("private-response-secret"), false);
    assert.equal(describeError(result.error).includes("private_account_id"), false);
  }
  const invalidRow = readAnalyticsRecords([{ iid: id, monthid: "invalid" }], true);
  assert.ok(!invalidRow.ok && invalidRow.error.kind === "parse");
  assert.match(describeError(invalidRow.error), /monthid/);
  assert.equal(readAnalyticsRecords([row]).ok, false);
});

test("monthly wrappers are identified by record fields, without mixing daily detail or metadata", async () => {
  const monthly = { iid: id, monthid: "202610", total_diamond: 125, total_points: 0, download_num: 13 };
  for (const payload of [
    { monthly_records: [monthly], daily_records: [row], count: 1 },
    { result: { monthly_records: [monthly], daily_records: [row] } },
  ]) {
    globalThis.fetch = async () => response(payload);
    const result = await getAnalyticsMonthly(session, range);
    assert.ok(result.ok);
    assert.equal(result.value.length, 1);
    assert.equal(result.value[0]?.diamonds, 125);
    assert.equal(result.value[0]?.emeralds, 0);
    assert.equal(result.value[0]?.downloads, 13);
    assert.equal(result.value[0]?.date, "2026-10");
  }
  for (const payload of [
    { current: [monthly], comparison: [monthly] },
    { monthly_records: [], count: 0 },
    { daily_records: [row] },
    { outer: { inner: { monthly_records: [monthly] } } },
    { monthly_records: [monthly], ...Object.fromEntries(Array.from({ length: 65 }, (_, i) => [String(i), {}])) },
  ]) {
    assert.equal(readAnalyticsRecords(payload, true).ok, false);
  }
  const malformed = readAnalyticsRecords({ monthly_records: [null, monthly] }, true);
  assert.ok(!malformed.ok && malformed.error.kind === "parse");
  assert.match(describeError(malformed.error), /第 1 条记录缺少 iid/);
});

test("monthly structure diagnostics expose bounded schema, never scalar response contents", () => {
  const result = readAnalyticsRecords(
    {
      result: { records: [{ monthid: "private-month", total_diamond: 987654321 }], count: 0 },
      session_cookie: "private-cookie",
      [id]: { res_name: "private-resource" },
      ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`extra_${i}`, "private-value"])),
    },
    true,
  );
  assert.ok(!result.ok && result.error.kind === "parse");
  const message = describeError(result.error);
  assert.match(message, /result:\{records:数组\(1\)，count:数字\}/);
  assert.match(message, /隐藏字段:字符串/);
  assert.ok(message.length < 600);
  for (const secret of [
    id,
    "session_cookie",
    "private-month",
    "987654321",
    "private-cookie",
    "private-resource",
    "private-value",
  ]) {
    assert.equal(message.includes(secret), false);
  }
});

test("daily rows retain real zeros, absent peer values and large string identifiers", () => {
  const result = readAnalyticsRecords({ data: [row, { iid: id, dateid: "20261002", diamond: 0 }] });
  assert.ok(result.ok);
  assert.equal(result.value[0]?.resourceId, id);
  assert.equal(result.value[0]?.purchases, 12);
  assert.equal(result.value[0]?.peers.purchases, 10);
  assert.equal(result.value[0]?.peers.rating, null);
  assert.equal(result.value[1]?.diamonds, 0);
  assert.equal(result.value[1]?.downloads, null);
  assert.equal(readAnalyticsRecords({}).ok, false);
  assert.equal(readAnalyticsRecords({ data: [row, row] }).ok, false);
  assert.equal(readAnalyticsRecords({ data: [{ ...row, dateid: "20260230" }] }).ok, false);
});

test("daily batches send authenticated read queries and keep only requested resources/dates", async () => {
  const calls: URL[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push(url);
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
    assert.equal(new Headers(init?.headers).get("Cookie"), "NTES_SESS=analytics-test-session");
    assert.equal(url.searchParams.get("start_date"), "20261001");
    assert.equal(url.searchParams.get("is_need_us_rank_data"), "false");
    const ids = url.searchParams.get("item_list_str")?.split(",") ?? [];
    return response({
      data: [
        ...ids.map((iid) => ({ ...row, iid })),
        { ...row, iid: "99999" },
        { ...row, iid: ids[0], dateid: "20260101" },
      ],
    });
  };
  const ids = Array.from({ length: 21 }, (_, index) => String(index + 1));
  const result = await getAnalyticsDaily(session, { ...range, resourceIds: ids });
  assert.ok(result.ok);
  assert.equal(result.value.length, 21);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.searchParams.get("item_list_str")?.split(",").length, 20);
  assert.equal(calls[1]?.searchParams.get("item_list_str"), "21");
});

test("empty selections avoid platform calls and daily failures never return incomplete totals", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response(null, "no_login");
  };
  assert.deepEqual(await getAnalyticsDaily(session, { ...range, resourceIds: [] }), { ok: true, value: [] });
  assert.equal(calls, 0);
  const result = await getAnalyticsDaily(session, { ...range, resourceIds: [id] });
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "session_expired");
});

test("native monthly totals use upstream ordering/deadline without inventing purchase counts", async (context) => {
  const deadlines: number[] = [];
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  context.mock.method(AbortSignal, "timeout", (ms: number) => {
    deadlines.push(ms);
    return timeout(ms);
  });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/data_analysis/month_detail/");
    assert.equal(url.searchParams.get("day_dateid"), "20261014");
    assert.equal(url.searchParams.get("order"), "DESC");
    return response({
      data: [
        {
          iid: id,
          monthid: "202610",
          res_name: "历史资源",
          total_diamond: 1400,
          total_points: 0,
          download_num: 300,
          avg_day_buy: 12,
        },
      ],
    });
  };
  const result = await getAnalyticsMonthly(session, range);
  assert.ok(result.ok);
  assert.equal(result.value[0]?.date, "2026-10");
  assert.equal(result.value[0]?.diamonds, 1400);
  assert.equal(result.value[0]?.purchases, null);
  assert.deepEqual(deadlines, [60_000]);
});

test("monthly rows accept calendar month representations and sum repeated resource/month rows", () => {
  for (const monthid of ["202610", 202610, "2026-10", "20261001", "2026-10-01", " 202610 "]) {
    const parsed = readAnalyticsRecords(
      {
        data: [
          { iid: id, monthid, total_diamond: 100, total_points: 0, download_num: 10 },
          { iid: id, monthid, total_diamond: 25, total_points: 0, download_num: 3 },
        ],
      },
      true,
    );
    assert.ok(parsed.ok, String(monthid));
    assert.deepEqual(
      parsed.value.map((record) => record.date),
      ["2026-10", "2026-10"],
    );
    assert.equal(aggregate(parsed.value, "diamonds"), 125);
    assert.equal(aggregate(parsed.value, "downloads"), 13);
    assert.equal(aggregate(parsed.value, "emeralds"), 0);
    const series = trackingSeries(
      [{ id, name: "测试资源", category: "pe", color: "red" }],
      parsed.value,
      ["2026-10"],
      "diamonds",
    );
    assert.deepEqual(series[0]?.values, [125]);
  }
});

test("monthly parse errors identify the rejected field without exposing response contents", () => {
  for (const monthid of ["202613", "20260230", "2026-02-30", null, "private-response-secret"]) {
    const result = readAnalyticsRecords({ data: [{ iid: id, monthid }] }, true);
    assert.ok(!result.ok);
    assert.equal(result.error.kind, "parse");
    assert.match(describeError(result.error), /月汇总第 1 条记录的 monthid/);
    assert.equal(describeError(result.error).includes("private-response-secret"), false);
  }
  const missingId = readAnalyticsRecords({ data: [{ monthid: "202610" }] }, true);
  assert.ok(!missingId.ok);
  assert.match(describeError(missingId.error), /iid/);
  const missingRows = readAnalyticsRecords({ data: {} }, true);
  assert.ok(!missingRows.ok);
  assert.match(describeError(missingRows.error), /未找到唯一可识别的记录数组/);
});

test("body-read timeout and network interruption are not reported as invalid platform JSON", async () => {
  globalThis.fetch = async () => {
    const reply = response({});
    reply.text = async () => {
      throw new DOMException("deadline", "TimeoutError");
    };
    return reply;
  };
  assert.deepEqual(await getMcDevData("test", "/test/", session), { ok: false, error: { kind: "timeout" } });
  globalThis.fetch = async () => {
    const reply = response({});
    reply.text = async () => {
      throw new TypeError("connection reset");
    };
    return reply;
  };
  const result = await getMcDevData("test", "/test/", session);
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "network");
});

test("HTML gateway errors preserve HTTP status while malformed successful JSON is a parse error", async () => {
  globalThis.fetch = async () => new Response("<html>private-response-secret</html>", { status: 504 });
  const gateway = await getMcDevData("test", "/test/", session);
  assert.ok(!gateway.ok && gateway.error.kind === "business");
  assert.equal(gateway.error.code, "504");
  assert.match(describeError(gateway.error), /HTTP 504/);
  assert.equal(describeError(gateway.error).includes("private-response-secret"), false);
  globalThis.fetch = async () => new Response("<html>not json</html>");
  const invalid = await getMcDevData("test", "/test/", session);
  assert.ok(!invalid.ok && invalid.error.kind === "parse");
  assert.match(describeError(invalid.error), /不是有效 JSON/);
});

test("realtime totals come from the payload and preserve raw refund and currency values", () => {
  const result = readRealtimeIncome(
    {
      count: 8,
      total_diamonds: 500,
      total_points: 100,
      orders: [
        {
          app_orderid: "order-1",
          ship_time: "2026-10-14T16:00:00Z",
          price_type: "diamond",
          price: 100,
          refund_status: "refunding",
          app_uid: "private-player-id",
        },
      ],
    },
    id,
  );
  assert.ok(result.ok);
  assert.equal(result.value.purchases, 8);
  assert.equal(result.value.orders.length, 1);
  assert.equal(result.value.diamonds, 500);
  assert.equal(result.value.orders[0]?.refundStatus, "refunding");
  assert.equal(JSON.stringify(result).includes("private-player-id"), false);
  assert.equal(readRealtimeIncome({}, id).ok, false);
});

test("realtime uses Beijing day boundaries and reports failed resources separately", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("begin_time"), "2026-10-14T16:00:00.000Z");
    assert.equal(url.searchParams.get("end_time"), "2026-10-15T15:59:59.999Z");
    if (url.pathname.includes("/2/")) return new Response("unavailable", { status: 503 });
    return response({ count: 0, total_diamonds: 0, total_points: 0, orders: [] });
  };
  const result = await getAnalyticsRealtime(session, { date: "2026-10-15", resourceIds: ["1", "2"] });
  assert.ok(result.ok);
  assert.deepEqual(result.value.failedResourceIds, ["2"]);
  assert.equal(result.value.resources.length, 1);
  assert.equal(result.value.resources[0]?.diamonds, 0);
  assert.equal(result.value.failures?.[0]?.kind, "business");
  assert.match(result.value.failures?.[0]?.message ?? "", /503/);
  assert.ok(Number.isFinite(Date.parse(result.value.queriedAt ?? "")));
});

test("blank or missing order currencies preserve all platform totals and order rows", () => {
  const orders = ["", null, undefined, "diamond", "point"].map((price_type, index) => ({
    app_orderid: `order-${index}`, ship_time: "2026-10-16T02:00:00Z", price: 100, price_type,
  }));
  const result = readRealtimeIncome({ count: 5, total_diamonds: 450, total_points: 20, orders }, id);
  assert.ok(result.ok);
  assert.equal(result.value.diamonds, 450);
  assert.equal(result.value.emeralds, 20);
  assert.equal(result.value.purchases, 5);
  assert.deepEqual(result.value.orders.map((order) => order.currency), ["unknown", "unknown", "unknown", "diamond", "point"]);
  assert.equal(result.value.ordersIncomplete, false);
});

test("malformed order details are reported separately from authoritative income totals", () => {
  const summary = { count: 2, total_diamonds: 200, total_points: 0 };
  const order = { app_orderid: "same-id", ship_time: "2026-10-16T02:00:00Z", price: 100, price_type: "diamond" };
  const partial = readRealtimeIncome({ ...summary, orders: [order, { ...order, price: null }] }, id);
  assert.ok(partial.ok);
  assert.equal(partial.value.diamonds, 200);
  assert.equal(partial.value.orders.length, 1);
  assert.equal(partial.value.omittedOrderCount, 1);
  assert.equal(partial.value.ordersIncomplete, true);
  const noDetails = readRealtimeIncome(summary, id);
  assert.ok(noDetails.ok && noDetails.value.ordersIncomplete);
  const repeated = readRealtimeIncome({ ...summary, orders: [order, order] }, id);
  assert.ok(repeated.ok && repeated.value.orders.length === 2);
  const invalidTotal = readRealtimeIncome({ ...summary, total_diamonds: null, orders: [] }, id);
  assert.ok(!invalidTotal.ok && invalidTotal.error.kind === "parse");
  assert.match(describeError(invalidTotal.error), /total_diamonds/);
});

test("targeted retries replace failures without double counting successful resources", () => {
  const resource = { resourceId: "1", diamonds: 100, emeralds: 20, purchases: 1, orders: [] };
  const previous = { resources: [resource], failedResourceIds: ["2", "3"], failures: [{ resourceId: "2", kind: "timeout", message: "timeout" }] };
  const incoming = { resources: [{ ...resource, resourceId: "2", diamonds: 250 }], failedResourceIds: ["3"], failures: [{ resourceId: "3", kind: "business", message: "503" }] };
  const merged = mergeRealtimeIncome(previous, incoming, ["2", "3"]);
  assert.equal(merged.resources.reduce((sum, row) => sum + row.diamonds, 0), 350);
  assert.deepEqual(merged.failedResourceIds, ["3"]);
  assert.deepEqual(merged.failures, incoming.failures);
  assert.deepEqual(mergeRealtimeIncome(merged, incoming, ["2", "3"]), merged);
});

test("realtime expiration propagates instead of being treated as a partial success", async () => {
  globalThis.fetch = async () => response(null, "no_login");
  const result = await getAnalyticsRealtime(session, { date: "2026-10-15", resourceIds: [id] });
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "session_expired");
});

test("calendar helpers handle Beijing midnight, leap years and year boundaries", () => {
  assert.equal(todayKey(new Date("2026-10-14T16:00:00Z")), "2026-10-15");
  assert.equal(daysInRange(7, "2024-03-01").at(-1), "2024-02-29");
  assert.deepEqual(monthsInRange(3, "2026-01-01"), ["2025-11", "2025-12", "2026-01"]);
});

test("income cycles include both boundary 22nds, overlap one day, and exclude today's unfinished data", () => {
  const current = incomeCycle(0, "2026-10-16");
  assert.equal(current.startDate, "2026-09-22");
  assert.equal(current.endDate, "2026-10-22");
  assert.equal(current.queryEnd, "2026-10-15");
  assert.equal(current.dates.length, 24);
  const closing = incomeCycle(0, "2026-10-22");
  assert.equal(closing.startDate, "2026-09-22");
  assert.equal(closing.queryEnd, "2026-10-21");
  const opening = incomeCycle(0, "2026-10-23");
  assert.equal(opening.startDate, "2026-10-22");
  assert.equal(opening.queryEnd, "2026-10-22");
  assert.deepEqual(opening.dates, ["2026-10-22"]);
  const previous = incomeCycle(-1, "2026-10-23");
  assert.equal(previous.endDate, "2026-10-22");
  assert.equal(previous.queryEnd, previous.endDate);
  assert.equal(previous.nextStart, opening.startDate);
  assert.deepEqual(
    previous.dates.filter((date) => opening.dates.includes(date)),
    ["2026-10-22"],
  );
  const september = incomeCycle(-1, "2026-10-16");
  assert.equal(september.startDate, "2026-08-22");
  assert.equal(september.endDate, "2026-09-22");
  assert.equal(september.dates.length, 32);
  const year = incomeCycle(0, "2026-01-02");
  assert.equal(year.startDate, "2025-12-22");
  assert.equal(year.queryEnd, "2026-01-01");
  const leap = incomeCycle(-1, "2024-03-23");
  assert.equal(leap.dates.length, 30);
  assert.ok(leap.dates.includes("2024-02-29"));
  assert.equal(incomeCycle(-1, "2025-03-23").dates.length, 29);
  assert.equal(incomeCycle(0, todayKey(new Date("2026-10-22T16:00:00Z"))).startDate, "2026-10-22");
});

test("period estimate formatting preserves cents and distinguishes unknown from zero", () => {
  assert.match(periodIncomeYuan(4300), /4,300\.00$/);
  assert.match(periodIncomeYuan(3612), /3,612\.00$/);
  assert.match(periodIncomeYuan(0), /0\.00$/);
  assert.equal(periodIncomeYuan(null), "—");
  assert.equal(periodIncomeYuan(Number.NaN), "—");
});

/** Minimal paid PE ledger row with an explicit, validated cost reference */
function costBill(month: string, cost = 340, status = "pay_success") {
  return { _id: `bill-${month}-${status}`, platform: "pe", data_month: month, status, total_diamond: 1000, channel_ip_cost: cost, income: "10.00", tax: "0.00", tech_service_fee: 0, total_usage_price: 0 };
}

test("PE period estimates use month totals and only earlier paid cost references", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === "/data_analysis/day_detail/") {
      assert.equal(url.searchParams.get("end_date"), "20261014");
      return response({ data: [{ ...row, diamond: 999999, refund_rate: 0.99 }] });
    }
    if (url.pathname === "/data_analysis/month_detail/") {
      assert.equal(url.searchParams.get("start_date"), "20261001");
      assert.equal(url.searchParams.get("end_date"), "20261031");
      return response({ data: [
        { iid: id, monthid: "202610", total_diamond: 200000 },
        { iid: id, monthid: "202610", total_diamond: 100000 },
        { iid: "2", monthid: "202610", total_diamond: 100000 },
        { iid: "3", monthid: "202610", total_diamond: 9000000 },
      ] });
    }
    assert.equal(url.pathname, "/incomes");
    assert.equal(url.searchParams.get("platform"), "pe");
    return response({ count: 4, incomes: [costBill("2026-10", 900), costBill("2026-11", 100), costBill("2026-09", 100, "init"), costBill("2026-09")] });
  };
  const result = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id, "2"] });
  assert.ok(result.ok && result.value.estimate);
  assert.equal(result.value.records[0]?.diamonds, 999999);
  const estimate = result.value.estimate;
  assert.equal(estimate.diamonds, 9400000);
  assert.equal(estimate.costRate, 0.34);
  assert.equal(estimate.costSourceMonth, "2026-09");
  assert.equal(estimate.developerShareYuan, 32505);
  assert.equal(estimate.subsidyYuan, 6200);
  assert.equal(estimate.totalYuan, 38705);
  assert.equal(estimate.afterTaxYuan, 32512.2);
  assert.equal(estimate.allocations.length, 3);
  assert.deepEqual(calls, ["/data_analysis/day_detail/", "/data_analysis/month_detail/", "/incomes"]);
});
test("PC period queries use comp resources and sales without applying PE payout rules", async () => {
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    if (url.pathname === "/items/categories/comp/") {
      return new Response(JSON.stringify({ status: 200, data: { item: [{ item_id: id, item_name: "PC work", create_time: "2026-01-01", online_time: "2026-01-02" }] } }));
    }
    assert.equal(url.searchParams.get("platform"), "pc");
    assert.equal(url.searchParams.get("category"), "comp");
    return new Response(JSON.stringify({ status: 200, data: { data: [row] } }));
  };
  const works = await listWorks(session, "pc");
  assert.ok(works.ok);
  assert.equal(works.value[0]?.name, "PC work");
  const result = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id], platform: "pc" });
  assert.ok(result.ok);
  assert.equal(result.value.records[0]?.diamonds, 100);
  assert.equal(result.value.estimate, null);
  assert.deepEqual(paths, ["/items/categories/comp/", "/data_analysis/day_detail/"]);
});

test("invalid platforms cannot fall back silently to PE data", async () => {
  globalThis.fetch = async () => { throw new Error("Invalid platforms must not reach the network"); };
  const platform = "comp" as "pc";
  assert.equal((await listWorks(session, platform)).ok, false);
  assert.equal((await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id], platform })).ok, false);
});

test("missing monthly inputs keep daily charts while zero monthly sales remains zero", async () => {
  for (const data of [[], [{ iid: id, monthid: "202610" }], [{ iid: id, monthid: "202610", total_diamond: -1 }]]) {
    globalThis.fetch = async (input) => new URL(String(input)).pathname === "/data_analysis/day_detail/" ? response({ data: [row] }) : response({ data });
    const result = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id] }, new Date("2026-11-01T00:00:00+08:00"));
    assert.ok(result.ok);
    assert.equal(result.value.records.length, 1);
    assert.equal(result.value.estimate, null);
    assert.ok(result.value.estimateError);
  }
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/incomes") return response({ count: 0, incomes: [] });
    return response({ data: path.includes("month_detail") ? [{ iid: id, monthid: "202610", total_diamond: 0 }] : [row] });
  };
  const zero = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id] }, new Date("2026-11-01T00:00:00+08:00"));
  assert.ok(zero.ok);
  assert.equal(zero.value.estimate?.totalYuan, 0);
  assert.match(zero.value.estimate?.warnings?.[0] ?? "", /30%/);
  globalThis.fetch = async () => response(null, "no_login");
  const expired = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id] }, new Date("2026-11-01T00:00:00+08:00"));
  assert.ok(!expired.ok && expired.error.kind === "session_expired");
});

test("cycle month labels and account-wide scope include historical resources", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes("day_detail")) return response({ data: [row] });
    if (url.pathname === "/incomes") return response({ count: 1, incomes: [{ ...costBill("2026-09"), channel_ip_cost: undefined }] });
    if (url.pathname.startsWith("/incomes/")) return response(costBill("2026-09"));
    assert.equal(url.searchParams.get("start_date"), "20261101");
    assert.equal(url.searchParams.get("end_date"), "20261130");
    return response({ data: [{ iid: "999", monthid: "202611", total_diamond: 100 }] });
  };
  const result = await getAnalyticsPeriodIncome(session, { ...range, settlementMonth: "2026-11", allResources: true, resourceIds: [id] });
  assert.ok(result.ok && result.value.estimate);
  assert.equal(result.value.estimate.month, "2026-11");
  assert.equal(result.value.estimate.diamonds, 100);
  assert.equal(result.value.estimate.costSourceMonth, "2026-09");
});

test("cost query expiry propagates and ordinary failures disclose a fallback", async () => {
  for (const status of ["no_login", "error"]) {
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === "/incomes") return response(null, status);
      return response({ data: path.includes("month_detail") ? [{ iid: id, monthid: "202610", total_diamond: 100 }] : [row] });
    };
    const result = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id] });
    if (status === "no_login") assert.ok(!result.ok && result.error.kind === "session_expired");
    else {
      assert.ok(result.ok && result.value.estimate);
      assert.equal(result.value.estimate.costRate, 0.3);
      assert.equal(result.value.estimate.costSourceMonth, null);
      assert.match(result.value.estimate.warnings?.[0] ?? "", /成本查询失败/);
    }
  }
});

test("current empty month totals use returned daily sales then yield to available monthly totals", async () => {
  let monthlyAvailable = false;
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/items/categories/pe/") return response({ item: [{ item_id: id, item_name: "work", create_time: "2026-01-01", online_time: "2026-01-01" }] });
    paths.push(path);
    if (path.includes("day_detail")) return response({ data: [{ ...row, diamond: 2000, refund_rate: 0.1 }, { ...row, dateid: "20261002", diamond: 1000, refund_rate: 0 }] });
    if (path === "/incomes") return response({ count: 1, incomes: [costBill("2026-09")] });
    return response(monthlyAvailable ? { data: [{ iid: id, monthid: "202610", total_diamond: 5000 }] } : {});
  };
  const now = new Date("2026-10-16T00:00:00+08:00");
  const provisional = await getAnalyticsPeriodIncome(session, { ...range, allResources: true, resourceIds: [id] }, now);
  assert.ok(provisional.ok && provisional.value.estimate);
  assert.equal(provisional.value.estimate.source, "pe-period-daily");
  assert.equal(provisional.value.estimate.diamonds, 2800);
  assert.equal(provisional.value.estimate.afterTaxYuan, 18.48);
  assert.equal(provisional.value.estimate.costSourceMonth, "2026-09");
  assert.match(provisional.value.estimate.warnings?.[0] ?? "", /日记录/);
  assert.deepEqual(paths, ["/data_analysis/day_detail/", "/data_analysis/month_detail/", "/incomes"]);
  monthlyAvailable = true;
  const monthly = await getAnalyticsPeriodIncome(session, { ...range, allResources: true, resourceIds: [id] }, now);
  assert.ok(monthly.ok && monthly.value.estimate);
  assert.equal(monthly.value.estimate.source, "pe-monthly");
  assert.equal(monthly.value.estimate.diamonds, 5000);
  assert.equal(monthly.value.estimate.afterTaxYuan, 33);
});

test("provisional estimates preserve genuine zero and reject missing or invalid daily amounts", async () => {
  for (const [records, expected] of [[[], null], [[{ ...row, diamond: null }], null], [[{ ...row, refund_rate: 2 }], null], [[{ ...row, diamond: 0 }], 0]] as const) {
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
    if (path === "/items/categories/pe/") return response({ item: [{ item_id: id, item_name: "work", create_time: "2026-01-01", online_time: "2026-01-01" }] });
      if (path.includes("day_detail")) return response({ data: records });
      if (path === "/incomes") return response({ count: 1, incomes: [costBill("2026-09")] });
      return response({});
    };
    const result = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id] }, new Date("2026-10-16T00:00:00+08:00"));
    assert.ok(result.ok);
    assert.equal(result.value.estimate?.totalYuan ?? null, expected);
  }
});

test("historical missing totals and malformed monthly responses never become provisional estimates", async () => {
  for (const [payload, now] of [[{}, "2026-11-01"], [{ unexpected: "schema" }, "2026-10-16"]] as const) {
    globalThis.fetch = async (input) => {
      const path = new URL(String(input)).pathname;
    if (path === "/items/categories/pe/") return response({ item: [{ item_id: id, item_name: "work", create_time: "2026-01-01", online_time: "2026-01-01" }] });
      assert.notEqual(path, "/incomes");
      return path.includes("day_detail") ? response({ data: [row] }) : response(payload);
    };
    const result = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id] }, new Date(`${now}T00:00:00+08:00`));
    assert.ok(result.ok);
    assert.equal(result.value.estimate, null);
    assert.ok(result.value.estimateError);
  }
});

test("a cycle starting on the 22nd can provisionally estimate next month's label", async () => {
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/items/categories/pe/") return response({ item: [{ item_id: id, item_name: "work", create_time: "2026-01-01", online_time: "2026-01-01" }] });
    if (path.includes("day_detail")) return response({ data: [{ ...row, dateid: "20261023" }] });
    if (path === "/incomes") return response({ count: 1, incomes: [costBill("2026-09")] });
    return response({ data: [] });
  };
  const result = await getAnalyticsPeriodIncome(session, { startDate: "2026-10-22", endDate: "2026-10-23", settlementMonth: "2026-11", resourceIds: [id] }, new Date("2026-10-24T00:00:00+08:00"));
  assert.ok(result.ok && result.value.estimate);
  assert.equal(result.value.estimate.source, "pe-period-daily");
  assert.equal(result.value.estimate.month, "2026-11");
});

test("selecting one module still uses the whole PE provisional account and stable allocations", async () => {
  const dailyBatches: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/items/categories/pe/") return response({ item: [id, "2"].map(item_id => ({ item_id, item_name: item_id, create_time: "2026-01-01", online_time: "2026-01-01" })) });
    if (url.pathname.includes("day_detail")) {
      const ids = url.searchParams.get("item_list_str")!.split(",");
      dailyBatches.push(ids.join(","));
      return response({ data: ids.map(iid => ({ ...row, iid, diamond: 50000 })) });
    }
    if (url.pathname === "/incomes") return response({ count: 1, incomes: [costBill("2026-09", 300)] });
    return response({});
  };
  const now = new Date("2026-10-16T00:00:00+08:00");
  const selected = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id], allResources: false }, now);
  const all = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id, "2"], allResources: true }, now);
  assert.ok(selected.ok && selected.value.estimate && all.ok && all.value.estimate);
  assert.equal(selected.value.estimate.totalYuan, 560);
  assert.equal(selected.value.estimate.allocations.find(r => r.resourceId === id)?.totalYuan, 280);
  assert.deepEqual(selected.value.estimate.allocations, all.value.estimate.allocations);
  assert.deepEqual(dailyBatches, [id, "2", `${id},2`]);
});

test("an unavailable account resource list cannot silently price a selected module as the entire account", async () => {
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.includes("day_detail")) return response({ data: [row] });
    if (path === "/items/categories/pe/") return response(null, "error");
    assert.notEqual(path, "/incomes");
    return response({});
  };
  const result = await getAnalyticsPeriodIncome(session, { ...range, resourceIds: [id] }, new Date("2026-10-16T00:00:00+08:00"));
  assert.ok(result.ok);
  assert.equal(result.value.estimate, null);
  assert.ok(result.value.estimateError);
});
test("period income totals filter scope, preserve zero and expose missing resource days", () => {
  const parsed = readAnalyticsRecords({ data: [row, { ...row, dateid: "20261002", diamond: 0, cnt_buy: 0 }] });
  assert.ok(parsed.ok);
  const resources = [
    { id, name: "甲", category: "pe", color: "red" },
    { id: "2", name: "乙", category: "pe", color: "blue" },
  ];
  const first = parsed.value[0];
  assert.ok(first);
  const records = [
    ...parsed.value,
    { ...first, resourceId: "outside", diamonds: 9999 },
    { ...first, date: "2026-09-22", diamonds: 9999 },
  ];
  const summary = summarizePeriodIncome(resources, records, ["2026-10-01", "2026-10-02", "2026-10-03"]);
  assert.deepEqual(summary.totals, { diamonds: 100, emeralds: 0, purchases: 12 });
  assert.equal(summary.missingDays, 4);
  assert.equal(summary.recordCount, 2);
  assert.deepEqual(
    summary.daily.map((day) => day.diamonds),
    [100, 0, null],
  );
  assert.equal(summary.resources[0]?.days, 2);
  assert.equal(summary.resources[1]?.diamonds, null);
  const missingMetric = summarizePeriodIncome(resources, [{ ...first, diamonds: null }], ["2026-10-01"]);
  assert.equal(missingMetric.totals.diamonds, null);
  assert.equal(summarizePeriodIncome(resources, [], ["2026-10-01"]).totals.diamonds, null);
});

test("charts keep missing days as gaps and totals distinguish unknown from zero", () => {
  const parsed = readAnalyticsRecords({ data: [row] });
  assert.ok(parsed.ok);
  const records = parsed.value;
  const series = trackingSeries(
    [{ id, name: "测试资源", category: "手游资源", color: "red" }],
    records,
    ["2026-10-01", "2026-10-02"],
    "diamonds",
  );
  assert.deepEqual(series[0]?.values, [100, null]);
  assert.equal(aggregate(records, "emeralds"), 0);
  assert.equal(aggregate([], "diamonds"), null);
  assert.equal(
    aggregate(
      records.map((record) => ({ ...record, diamonds: null })),
      "diamonds",
    ),
    null,
  );
  assert.equal(formatValue(null), "—");
  assert.equal(formatValue(0), "0");
});

test("top ten ranks interval totals per metric and excludes unknown or out-of-scope data", () => {
  const parsed = readAnalyticsRecords({ data: [row] });
  assert.ok(parsed.ok);
  const first = parsed.value[0]!;
  const resources = Array.from({ length: 14 }, (_, index) => ({ id: String(index), name: String(index), category: "pe", color: "red" }));
  const records = resources.flatMap((resource, index) => [
    { ...first, resourceId: resource.id, purchases: index, downloads: 14 - index },
    { ...first, resourceId: resource.id, date: "2026-10-02", purchases: index, downloads: 14 - index },
  ]);
  records.push({ ...first, resourceId: "0", date: "2026-09-01", purchases: 99999 });
  records.push({ ...first, resourceId: "outside", purchases: 99999 });
  const dates = ["2026-10-01", "2026-10-02"];
  assert.deepEqual(topResources(resources, records, dates, "purchases").map((resource) => resource.id), ["13", "12", "11", "10", "9", "8", "7", "6", "5", "4"]);
  assert.deepEqual(topResources(resources, records, dates, "downloads").map((resource) => resource.id), ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  assert.deepEqual(topResources(resources, [], dates, "purchases"), []);
  const sparse = [
    { ...first, resourceId: "0", purchases: 0 },
    { ...first, resourceId: "1", purchases: null },
    { ...first, resourceId: "2", purchases: 5 },
    { ...first, resourceId: "2", date: "2026-10-02", purchases: null },
    { ...first, resourceId: "3", purchases: 0 },
  ];
  assert.deepEqual(topResources(resources, sparse, dates, "purchases").map((resource) => resource.id), ["0", "3"]);
});

test("analysis uses publication history rather than the current review status", async () => {
  globalThis.fetch = async () =>
    response({
      item: [
        {
          item_id: id,
          item_name: "已下架作品",
          create_time: "2026-01-01",
          status: "offline",
          online_time: "2026-02-01",
          pri_type: 2,
        },
      ],
    });
  const result = await listWorks(session);
  assert.ok(result.ok);
  assert.equal(result.value[0]?.onlineTime, "2026-02-01");
  const published = result.value[0];
  assert.ok(published);
  assert.equal(isAnalyzableWork(published), true);
  assert.equal(isAnalyzableWork({ isPrerequisite: false, onlineTime: "UNKNOWN" }), false);
  assert.equal(isAnalyzableWork({ isPrerequisite: false, onlineTime: null }), false);
  assert.equal(isAnalyzableWork({ isPrerequisite: true, onlineTime: "2026-02-01" }), false);
});

test("nonempty mismatched responses report the cause rather than silently drawing an empty chart", async () => {
  globalThis.fetch = async () => response({ data: [{ ...row, iid: "999" }] });
  const mismatchedId = await getAnalyticsDaily(session, { ...range, resourceIds: [id] });
  assert.ok(!mismatchedId.ok && mismatchedId.error.kind === "business");
  assert.equal(mismatchedId.error.code, "analytics_mismatch");
  assert.match(mismatchedId.error.message, /资源标识/);
  globalThis.fetch = async () => response({ data: [{ ...row, dateid: "20260901" }] });
  const mismatchedDate = await getAnalyticsDaily(session, { ...range, resourceIds: [id] });
  assert.ok(!mismatchedDate.ok && mismatchedDate.error.kind === "business");
  assert.match(mismatchedDate.error.message, /日期/);
  globalThis.fetch = async () => response({ data: [] });
  assert.deepEqual(await getAnalyticsDaily(session, { ...range, resourceIds: [id] }), { ok: true, value: [] });
});

test("peer statistics are requested only by module comparison and malformed flags never reach the network", async () => {
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    assert.equal(new URL(String(input)).searchParams.get("is_need_us_rank_data"), "true");
    return response({ data: [row] });
  };
  const result = await getAnalyticsDaily(session, { ...range, resourceIds: [id], includePeers: true });
  assert.ok(result.ok);
  assert.equal(result.value[0]?.peers.purchases, 10);
  const invalid = { ...range, resourceIds: [id], includePeers: "false" };
  // Simulate an untrusted caller bypassing the TypeScript contract
  const rejected = await getAnalyticsDaily(session, invalid as unknown as Parameters<typeof getAnalyticsDaily>[1]);
  assert.equal(rejected.ok, false);
  assert.equal(calls, 1);
});

test("analysis cache shares in-flight work and respects account keys, expiry and explicit refresh", async () => {
  let clock = 0;
  let calls = 0;
  const cache = new AnalyticsQueryCache(3, () => clock);
  const load = async () => {
    calls++;
    return { ok: true as const, value: calls };
  };
  const first = cache.read("account-a/daily", 100, load);
  assert.equal(cache.read("account-a/daily", 100, load), first);
  await first;
  await cache.read("account-a/daily", 100, load);
  assert.equal(calls, 1);
  assert.equal(cache.peek("account-b/daily"), null);
  await cache.read("account-b/daily", 100, load);
  assert.equal(calls, 2);
  clock = 101;
  assert.equal(cache.fresh("account-a/daily"), false);
  assert.equal(cache.peek("account-a/daily"), 1);
  await cache.read("account-a/daily", 100, load);
  assert.equal(calls, 3);
  cache.invalidate("account-a/daily");
  await cache.read("account-a/daily", 100, load);
  assert.equal(calls, 4);
  cache.invalidate();
  assert.equal(cache.peek("account-b/daily"), null);
});

test("late cache responses cannot repopulate entries after refresh or logout", async () => {
  const cache = new AnalyticsQueryCache();
  const old = Promise.withResolvers<{ ok: true; value: string }>();
  const pending = cache.read("a", 1000, () => old.promise);
  cache.invalidate();
  await cache.read("a", 1000, async () => ({ ok: true, value: "new" }));
  old.resolve({ ok: true, value: "old" });
  await pending;
  assert.equal(cache.peek("a"), "new");
});

test("cache keeps failures out, bounds memory, and realtime always revalidates", async () => {
  const cache = new AnalyticsQueryCache(2);
  const load = async () => ({ ok: true as const, value: 0 });
  await cache.read("a", 1000, load);
  await cache.read("b", 1000, load);
  await cache.read("c", 1000, load);
  assert.equal(cache.peek("a"), null);
  cache.invalidate("b");
  const rejected = await cache.read("b", 1000, async () => {
    throw new Error("unavailable");
  });
  assert.equal(rejected.ok, false);
  assert.equal(cache.fresh("b"), false);
  assert.equal(cache.peek("b"), null);
  await cache.read("realtime", 0, load);
  assert.equal(cache.peek("realtime"), 0);
  assert.equal(cache.fresh("realtime"), false);
});

test("request pool refills free slots without waiting for its slowest neighbor", async () => {
  const gates = Array.from({ length: 7 }, () => Promise.withResolvers<Result<number>>());
  const started: number[] = [];
  let active = 0;
  let maxActive = 0;
  const pending = runAnalyticsPool(
    gates.map((gate, index) => async () => {
      started.push(index);
      active++;
      maxActive = Math.max(maxActive, active);
      const result = await gate.promise;
      active--;
      return result;
    }),
    3,
    true,
  );
  assert.deepEqual(started, [0, 1, 2]);
  gates[1]?.resolve(ok(1));
  await nextTick();
  assert.deepEqual(started, [0, 1, 2, 3]);
  for (const [index, gate] of gates.entries()) gate.resolve(ok(index));
  const results = await pending;
  assert.equal(maxActive, 3);
  assert.deepEqual(
    results.map((result) => (result.ok ? result.value : null)),
    [0, 1, 2, 3, 4, 5, 6],
  );
});

test("fatal pool errors stop scheduling remaining work", async () => {
  let started = 0;
  const failure = fail({ kind: "session_expired" });
  const results = await runAnalyticsPool(
    Array.from({ length: 20 }, () => async () => {
      started++;
      return failure;
    }),
    4,
    false,
  );
  assert.equal(started, 4);
  assert.equal(results.length, 4);
  assert.ok(results.every((result) => !result.ok));
});
