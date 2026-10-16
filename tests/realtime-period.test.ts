import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { isAnalyticsRealtimeParams } from "../packages/contracts/src/rpc/analytics";
import { businessTools } from "../packages/mcp/src/business-tools";
import { getAnalyticsRealtime } from "../packages/netease/src/endpoints/analytics";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "realtime-period-test" };
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("realtime interval boundaries include both Beijing dates and preserve platform totals", async () => {
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("begin_time"), "2024-02-27T16:00:00.000Z");
    assert.equal(url.searchParams.get("end_time"), "2024-03-01T15:59:59.999Z");
    return Response.json({ code: 0, data: { count: 12, total_diamonds: 1234, total_points: 456, orders: [] } });
  };
  const result = await getAnalyticsRealtime(session, {
    date: "2024-02-28",
    endDate: "2024-03-01",
    resourceIds: ["1", "2"],
  });
  assert.ok(result.ok);
  assert.equal(calls, 2, "one platform query per resource, regardless of interval length");
  assert.equal(result.value.resources[0]?.diamonds, 1234);
  assert.equal(result.value.resources[0]?.purchases, 12);
  assert.equal(result.value.resources[0]?.ordersIncomplete, true);
});

test("realtime range validation remains compatible with single dates and bounds inclusive intervals", async () => {
  const base = { date: "2024-01-01", resourceIds: ["1"] };
  const schema = businessTools.find((tool) => tool.name === "analytics_realtime")?.schema;
  assert.ok(schema);
  for (const params of [base, { ...base, endDate: "2024-01-01" }, { ...base, endDate: "2024-12-31" }]) {
    assert.equal(isAnalyticsRealtimeParams(params), true);
    assert.equal(schema.safeParse(params).success, true);
  }
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("invalid input must not reach platform");
  };
  for (const params of [
    { ...base, endDate: "2023-12-31" },
    { ...base, endDate: "2024-02-30" },
    { ...base, endDate: "2025-01-01" },
    { ...base, endDate: null },
    { ...base, resourceIds: ["1", "1"] },
  ]) {
    assert.equal(isAnalyticsRealtimeParams(params), false);
    assert.equal(schema.safeParse(params).success, false);
    const result = await getAnalyticsRealtime(session, params as Parameters<typeof getAnalyticsRealtime>[1]);
    assert.ok(!result.ok);
  }
  assert.equal(calls, 0);
});
