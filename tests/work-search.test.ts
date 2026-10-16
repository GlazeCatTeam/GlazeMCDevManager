import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { RpcResult, WorkSearchPage } from "../packages/contracts/src";
import { searchWorks } from "../packages/netease/src/endpoints/works";
import { BannerWorkIcons } from "../plugins/promotion/src/views/banner-work-icons";
import { BannerWorkSearch } from "../plugins/promotion/src/views/banner-work-search";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "search-test-only" };
const params = { account: "a", query: "分页作品", kind: "name" as const, page: 0, pageSize: 5 };
const longId = "4690983497279236403";
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Provide a platform envelope without contacting a live account */
function reply(data: unknown) {
  return new Response(JSON.stringify({ status: "ok", data }));
}

test("name search requests only five matching works and preserves query and offset", async () => {
  const calls: URL[] = [];
  globalThis.fetch = async (input) => {
    calls.push(new URL(String(input)));
    return reply({ count: 12, item: [{ item_id: longId, item_name: "分页作品", status: "online" }] });
  };
  const result = await searchWorks(session, { ...params, query: "  分页作品 & A  ", page: 1 });
  assert.equal(result.ok && result.value.total, 12);
  assert.equal(result.ok && result.value.items[0]?.itemId, longId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.searchParams.get("item_name"), "分页作品 & A");
  assert.equal(calls[0]?.searchParams.get("start"), "5");
  assert.equal(calls[0]?.searchParams.get("span"), "5");
  assert.equal(calls[0]?.searchParams.has("mc_status"), false);
  assert.equal(calls[0]?.searchParams.has("pri_type"), false);
});

test("full ID lookup uses a single authenticated detail request without numeric rounding", async () => {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(new URL(String(input)).pathname, `/items/categories/pe/${longId}`);
    assert.match(new Headers(init?.headers).get("Cookie") ?? "", /search-test-only/);
    return new Response(`{"status":"ok","data":{"item_id":${longId},"item_name":"精确作品","status":"offline"}}`);
  };
  const result = await searchWorks(session, { ...params, kind: "id", query: longId });
  assert.deepEqual(result.ok && result.value, {
    total: 1,
    items: [{ itemId: longId, name: "精确作品", status: "offline" }],
  });
  assert.equal(calls, 1);
});

test("ID not found is empty but denied access, expired sessions and malformed IDs are not no-results", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ status: "404", msg: "不存在" }), { status: 404 });
  assert.deepEqual(await searchWorks(session, { ...params, kind: "id", query: longId }), {
    ok: true,
    value: { items: [], total: 0 },
  });
  for (const status of [403, 401]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ status: String(status) }), { status });
    assert.equal((await searchWorks(session, { ...params, kind: "id", query: longId })).ok, false);
  }
  globalThis.fetch = async () => {
    throw new Error("Invalid inputs must not reach the network");
  };
  for (const query of ["", "../foo", "1e19", "9".repeat(33)]) {
    const result = await searchWorks(session, { ...params, kind: "id", query });
    assert.equal(!result.ok && result.error.kind === "business" && result.error.code === "validation", true);
  }
});

test("search rejects an unrelated detail ID and incomplete or oversized result pages", async () => {
  globalThis.fetch = async () => reply({ item_id: "123", item_name: "其他作品" });
  assert.equal((await searchWorks(session, { ...params, kind: "id", query: longId })).ok, false);
  for (const data of [
    { item: [] },
    { count: 3, item: [] },
    { count: 6, item: Array.from({ length: 6 }, () => ({ item_id: "1", item_name: "作品" })) },
  ]) {
    globalThis.fetch = async () => reply(data);
    assert.equal((await searchWorks(session, params)).ok, false);
  }
});

/** Build distinct small pages for cache, retry and stale-response scenarios */
function page(start: number, count: number, total = 12): RpcResult<WorkSearchPage> {
  return {
    ok: true,
    value: {
      total,
      items: Array.from({ length: count }, (_, index) => ({
        itemId: String(start + index),
        name: `作品 ${start + index}`,
        status: "online",
      })),
    },
  };
}

test("search model reads 5+5+2 on demand and coalesces rapid load-more requests", async () => {
  const reads: number[] = [];
  const model = new BannerWorkSearch(async (_query, _kind, index) => {
    reads.push(index);
    return page(index * 5, index === 2 ? 2 : 5);
  });
  model.activate("作品", "name");
  await Promise.all([model.start(), model.start(), model.loadMore()]);
  assert.deepEqual(reads, [0]);
  assert.equal(model.getSnapshot().data?.length, 5);
  await model.loadMore();
  assert.equal(model.getSnapshot().data?.length, 10);
  await model.loadMore();
  assert.equal(model.getSnapshot().data?.length, 12);
  await model.loadMore();
  assert.deepEqual(reads, [0, 1, 2]);
  assert.equal(model.hasMore(), false);
});

test("an older query response cannot replace the latest results or advance its cursor", async () => {
  let finishOld!: (value: RpcResult<WorkSearchPage>) => void;
  const model = new BannerWorkSearch((query) =>
    query === "old"
      ? new Promise((resolve) => {
          finishOld = resolve;
        })
      : Promise.resolve(page(100, 1, 1)),
  );
  model.activate("old", "name");
  const old = model.start();
  await Promise.resolve();
  model.activate("new", "name");
  await model.start();
  finishOld(page(1, 5));
  await old;
  assert.equal(model.getSnapshot().query, "new");
  assert.equal(model.getSnapshot().data?.[0]?.itemId, "100");
  assert.equal(model.hasMore(), false);
});

test("failed next pages retain selection and retry the same page; clearing restores browse position", async () => {
  let fail = true;
  const reads: string[] = [];
  const model = new BannerWorkSearch(async (query, _kind, index) => {
    reads.push(`${query}:${index}`);
    if (index === 1 && fail) return { ok: false, error: { kind: "network", message: "offline" } };
    return page(index * 5, 5);
  });
  await model.start();
  model.saveScroll(123);
  await model.loadMore();
  assert.equal(model.getSnapshot().data?.length, 5);
  assert.equal(model.selected("1")?.name, "作品 1");
  fail = false;
  await model.loadMore();
  assert.deepEqual(reads, [":0", ":1", ":1"]);
  model.activate("other", "name");
  await model.start();
  assert.equal(model.selected("1")?.name, "作品 1");
  model.activate("", "id");
  await model.start();
  assert.equal(model.getSnapshot().data?.length, 10);
  assert.equal(model.getScroll(), 123);
  assert.equal(reads.length, 4);
});

test("restoring an unseen selection uses an exact lookup and account models do not share it", async () => {
  const reads: string[] = [];
  const model = new BannerWorkSearch(async (query, kind) => {
    reads.push(`${kind}:${query}`);
    return page(999, 1, 1);
  });
  await model.ensureSelected("999");
  await model.ensureSelected("999");
  assert.deepEqual(reads, ["id:999"]);
  assert.equal(model.getSnapshot().data, null);
  assert.equal(model.selected("999")?.itemId, "999");
  const other = new BannerWorkSearch(async () => page(100, 1, 1));
  assert.equal(other.selected("999"), undefined);
});

test("refresh ignores pending results from the previous generation", async () => {
  let finishOld!: (value: RpcResult<WorkSearchPage>) => void;
  let reads = 0;
  const model = new BannerWorkSearch(() =>
    ++reads === 1
      ? new Promise((resolve) => {
          finishOld = resolve;
        })
      : Promise.resolve(page(100, 1, 1)),
  );
  const old = model.start();
  await Promise.resolve();
  await model.reload();
  finishOld(page(1, 5));
  await old;
  assert.equal(model.getSnapshot().data?.[0]?.itemId, "100");
  assert.equal(model.selected("1"), undefined);
});

test("matching cached works appear immediately but are replaced by the authoritative first search page", async () => {
  const reads: string[] = [];
  const model = new BannerWorkSearch(async (query) => {
    reads.push(query);
    return query ? page(100, 1, 1) : page(1, 5);
  });
  await model.start();
  model.activate("作品", "name");
  assert.equal(model.getSnapshot().data?.length, 5);
  assert.equal(model.getSnapshot().preview, true);
  assert.equal(model.hasMore(), false);
  await model.start();
  assert.deepEqual(reads, ["", "作品"]);
  assert.equal(model.getSnapshot().preview, false);
  assert.equal(model.getSnapshot().data?.length, 1);
  assert.equal(model.getSnapshot().data?.[0]?.itemId, "100");
});

test("partial ID input never previews an unrelated cached work and empty confirmation removes cached matches", async () => {
  const model = new BannerWorkSearch(async (query) => (query ? page(0, 0, 0) : page(100, 5)));
  await model.start();
  model.activate("10", "id");
  assert.equal(model.getSnapshot().data, null);
  model.activate("100", "id");
  assert.equal(model.getSnapshot().data?.length, 1);
  await model.start();
  assert.deepEqual(model.getSnapshot().data, []);
  assert.equal(model.getSnapshot().preview, false);
});

test("refresh and transient failures keep visible rows until a replacement succeeds", async () => {
  let offline = false;
  const model = new BannerWorkSearch(async () =>
    offline ? { ok: false, error: { kind: "network", message: "offline" } } : page(1, 5),
  );
  await model.start();
  model.saveScroll(80);
  offline = true;
  const refresh = model.reload();
  assert.equal(model.getSnapshot().data?.length, 5);
  assert.equal(model.getScroll(), 80);
  await refresh;
  assert.equal(model.getSnapshot().data?.length, 5);
  assert.equal(model.getSnapshot().error?.kind, "network");
  offline = false;
  await model.loadMore();
  assert.equal(model.getSnapshot().preview, false);
  assert.equal(model.getSnapshot().error, null);
});

/** Let icon transport promises and their completion handlers settle without arbitrary sleeps */
async function flushIcons() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("icons share reads, limit concurrency to two, cancel queued rows and reuse cache across remounts", async () => {
  const reads: string[] = [];
  const pending = new Map<string, (url: string | null) => void>();
  const icons = new BannerWorkIcons((id) => {
    reads.push(id);
    return new Promise((resolve) => pending.set(id, resolve));
  });
  const received: (string | null)[] = [];
  icons.subscribe("1", (url) => received.push(url));
  icons.subscribe("1", (url) => received.push(url));
  icons.subscribe("2", () => {});
  const cancelThird = icons.subscribe("3", () => assert.fail("Unmounted row should not receive an icon"));
  icons.subscribe("4", () => {});
  await flushIcons();
  assert.deepEqual(reads, ["1", "2"]);
  cancelThird();
  icons.setPaused(true);
  pending.get("1")?.("icon-1");
  await flushIcons();
  assert.deepEqual(received, ["icon-1", "icon-1"]);
  assert.deepEqual(reads, ["1", "2"]);
  icons.subscribe("1", (url) => received.push(url));
  assert.equal(received.length, 3);
  icons.setPaused(false);
  await flushIcons();
  assert.deepEqual(reads, ["1", "2", "4"]);
  pending.get("2")?.(null);
  pending.get("4")?.("icon-4");
  await flushIcons();
  assert.equal(icons.peek("2"), null);
  assert.equal(icons.peek("4"), "icon-4");
});

test("failed icons do not hammer the service on row remount or leak between accounts", async () => {
  let reads = 0;
  const icons = new BannerWorkIcons(async () => {
    reads++;
    throw new Error("offline");
  });
  icons.subscribe("1", () => {});
  await flushIcons();
  icons.subscribe("1", () => {});
  await flushIcons();
  assert.equal(reads, 1);
  assert.equal(icons.peek("1"), null);
  const other = new BannerWorkIcons(async () => "other-account-icon");
  assert.equal(other.peek("1"), undefined);
});
