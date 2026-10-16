import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { getRankList, getRankPage } from "../packages/netease/src/endpoints/rank";
import { getRankIcons } from "../packages/netease/src/endpoints/rank-images";
import { homeEntry, readHome } from "../plugins/home/src/home-query";

const session = { sessionCookie: "offline-rank-cookie" };
const imageUrl = "https://x19.fp.ps.netease.com/file/rank-test";
Object.assign(globalThis, { glaze: undefined });

test("removed desktop boards are rejected before any platform request", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("Unexpected request");
  });
  for (const board of ["pc_download", "pc_like"]) {
    const result = await getRankPage(session, board as Parameters<typeof getRankPage>[1], "mod", 0, 50);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "business");
  }
  assert.equal(calls, 0);
});

test("paged rankings keep absolute positions and continue past the previous top-50 boundary", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    const start = Number(url.searchParams.get("start"));
    const length = Math.min(50, 157 - start);
    return Response.json({
      status: "ok",
      data: {
        count: 157,
        data: Array.from({ length }, (_, index) => ({
          item_id: String(start + index),
          item_name: `Work ${start + index}`,
          icon_url: imageUrl,
          rank: index + 1,
          rank_change: 20,
        })),
      },
    });
  });
  const middle = await getRankPage(session, "pe_download", "mod", 50, 50);
  assert.equal(middle.ok, true);
  if (!middle.ok) return;
  assert.equal(middle.value.items[0]?.rank, 51);
  assert.deepEqual(middle.value.items[0]?.change, { kind: "up", value: 20 });
  assert.equal(middle.value.items.at(-1)?.rank, 100);
  assert.equal(middle.value.nextStart, 100);
  const last = await getRankPage(session, "pe_download", "mod", 150, 50);
  assert.equal(last.ok && last.value.items.at(-1)?.rank, 157);
  assert.equal(last.ok && last.value.nextStart, null);
});

test("empty search terms remain identifiable; empty tail pages terminate despite an overstated total", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string) =>
    Response.json({
      status: "ok",
      data: {
        count: 200,
        data: new URL(input).searchParams.get("start") === "0" ? [{ content: "", rank: 37, last_rank: 74 }] : [],
      },
    }),
  );
  const first = await getRankPage(session, "hot_search", "mod", 0, 50);
  assert.equal(first.ok && first.value.items[0]?.title, "（空搜索词）");
  assert.deepEqual(first.ok && first.value.items[0]?.change, { kind: "up", value: 37 });
  const last = await getRankPage(session, "hot_search", "mod", 150, 50);
  assert.equal(last.ok && last.value.nextStart, null);
});

test("malformed pagination metadata and failed pages are errors rather than successful empty lists", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ status: "ok", data: { count: -1, data: [] } }));
  assert.equal((await getRankPage(session, "pe_sell", "mod", 0, 50)).ok, false);
  assert.equal((await getRankPage(session, "pe_sell", "mod", -1, 50)).ok, false);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("offline");
  });
  assert.equal((await getRankPage(session, "pe_sell", "mod", 50, 50)).ok, false);
});

test("free ranking enriches exact string IDs in one cookie-free public request, preserving order", async (t) => {
  const calls: { url: string; options: RequestInit | undefined }[] = [];
  const ids = ["4670588701215550658", "4679987371177390518"];
  t.mock.method(globalThis, "fetch", async (input: string, options?: RequestInit) => {
    calls.push({ url: String(input), options });
    if (String(input).includes("/square/"))
      return Response.json({
        status: "ok",
        data: {
          count: ids.length,
          data: ids.map((id, index) => ({ item_id: id, item_name: `Work ${index}`, rank: index + 1, rank_change: 1 })),
        },
      });
    return Response.json({
      code: 0,
      entities: [
        { item_id: ids[1], title_image_url: `${imageUrl}2` },
        { item_id: ids[0], title_image_url: imageUrl },
      ],
    });
  });
  const result = await getRankList(session, "pe_download", "mod", 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.value.map((row) => row.itemId),
    ids,
  );
  assert.deepEqual(
    result.value.map((row) => row.iconUrl),
    [imageUrl, `${imageUrl}2`],
  );
  assert.equal(calls.length, 2);
  const publicRequest = calls[1]?.options;
  assert.deepEqual(publicRequest?.headers, { "Content-Type": "application/json" });
  assert.equal(publicRequest?.credentials, "omit");
  assert.equal(publicRequest?.redirect, "error");
  const body = JSON.parse(String(publicRequest?.body));
  assert.deepEqual(body.item_id_list, ids);
  assert.equal(
    body.sign,
    createHash("md5")
      .update(`channel_id=5&item_id_list=${JSON.stringify(ids)}&mc#h5page#web`)
      .digest("hex"),
  );
  await getRankList(session, "pe_download", "mod", 2);
  assert.equal(calls.length, 3, "successful icons are reused");
});

test("missing, unsafe and failed thumbnails preserve rankings and can retry", async (t) => {
  let failImages = true;
  t.mock.method(globalThis, "fetch", async (input: string) => {
    if (String(input).includes("/square/"))
      return Response.json({
        status: "ok",
        data: { count: 1, data: [{ item_id: "9001", item_name: "Valid work", rank: 1 }] },
      });
    if (failImages) throw new Error("offline");
    return Response.json({
      code: 0,
      entities: [
        { item_id: "9001", title_image_url: "https://untrusted.example/icon" },
        { item_id: "9002", title_image_url: imageUrl },
      ],
    });
  });
  const result = await getRankList(session, "pe_sell", "map", 1);
  assert.equal(result.ok && result.value[0]?.iconUrl, null);
  failImages = false;
  assert.equal((await getRankIcons(["9001"])).size, 0, "reject unsafe hosts and unrelated response IDs");
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ code: 0, entities: [{ item_id: "9001", title_image_url: imageUrl }] }),
  );
  assert.equal((await getRankIcons(["9001"])).get("9001"), imageUrl);
});

test("hot search skips covers; native thumbnails skip the public lookup; mobile categories remain correct", async (t) => {
  const paths: URL[] = [];
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    paths.push(url);
    const board = url.searchParams.get("type");
    const row =
      board === "hot_search"
        ? { content: "Search", rank: 1 }
        : board === "pe_hot"
          ? { iid: "2001", res_name: "Hot", icon_url: imageUrl }
          : { item_id: "2002", item_name: "Mobile", icon_url: imageUrl };
    return Response.json({ status: "ok", data: { count: 1, data: [row] } });
  });
  assert.equal((await getRankList(session, "hot_search", "map", 1)).ok, true);
  assert.equal((await getRankList(session, "pe_hot", "map", 1)).ok, true);
  assert.equal((await getRankList(session, "pe_download", "mod", 1)).ok, true);
  assert.equal(paths.length, 3);
  assert.deepEqual(
    paths.map((url) => url.searchParams.get("first_type")),
    ["0", "1", "2"],
  );
});

test("public thumbnail reads coalesce and reject invalid IDs", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({ code: 0, entities: [{ item_id: "8001", title_image_url: imageUrl }] });
  });
  await Promise.all([getRankIcons(["8001"]), getRankIcons(["8001"])]);
  await getRankIcons(["../unsafe"]);
  assert.equal(calls, 1);
});

test("home cache coalesces navigation reads, retains rows on failed refresh, and isolates account keys", async (t) => {
  let calls = 0;
  let fail = false;
  t.mock.property(globalThis, "glaze", {
    rpc: async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return fail ? { ok: false, error: { kind: "network", message: "offline" } } : { ok: true, value: [] };
    },
  });
  const params = { board: "pe_hot" as const, account: "a" };
  await Promise.all([readHome("a:hot", "rank.list", params), readHome("a:hot", "rank.list", params)]);
  await readHome("a:hot", "rank.list", params);
  assert.equal(calls, 1);
  const data = homeEntry("a:hot").snapshot.data;
  fail = true;
  const refresh = readHome("a:hot", "rank.list", params, true);
  assert.equal(homeEntry("a:hot").snapshot.data, data);
  await refresh;
  assert.equal(homeEntry("a:hot").snapshot.data, data);
  assert.equal(homeEntry("a:hot").snapshot.error?.message, "offline");
  assert.equal(homeEntry("b:hot").snapshot.data, null);
  assert.equal(calls, 2);
});
