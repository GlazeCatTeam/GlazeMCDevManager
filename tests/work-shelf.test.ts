import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getWork, getWorksPage, listWorks } from "../packages/netease/src/endpoints/works";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const session = { sessionCookie: "unit-test-only" };

test("detail reads weak-offline state even when list and archive summaries omit it", async () => {
  const row = { item_id: "42", item_name: "弱下架作品", status: "init", create_time: "2026-10-01" };
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    return new Response(
      JSON.stringify({
        status: "ok",
        data: url.pathname.endsWith("/42")
          ? { ...row, weak_offline: true, weak_offline_reason: "暂停展示" }
          : { count: 1, item: [row] },
      }),
    );
  };
  const page = await getWorksPage(session, 0, 9);
  const list = await listWorks(session);
  const detail = await getWork(session, "42");
  assert.equal(page.ok && page.value.items[0]?.weakOffline, false);
  assert.equal(list.ok && list.value[0]?.weakOffline, false);
  assert.equal(detail.ok && detail.value.weakOffline, true);
  assert.equal(detail.ok && detail.value.weakOfflineReason, "暂停展示");
  assert.equal(paths.length, 3);
});

test("detail preserves explicit false and distinguishes absent shelf state", async () => {
  for (const value of [true, false, undefined]) {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ status: "ok", data: { item_name: "作品", weak_offline: value } }));
    const detail = await getWork(session, "42");
    assert.equal(detail.ok && detail.value.weakOffline, value);
    assert.equal(detail.ok && detail.value.weakOfflineReason, null);
  }
});

test("detail failures propagate instead of returning an invented shelf state", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ status: "no_login" }));
  const detail = await getWork(session, "42");
  assert.equal(detail.ok, false);
  if (!detail.ok) assert.equal(detail.error.kind, "session_expired");
});
