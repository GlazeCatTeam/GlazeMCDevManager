import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { CommentPage, RpcResult } from "../packages/contracts/src";
import { capabilities } from "../packages/contracts/src/rpc/capabilities";
import {
  commentTypes,
  isCommentListParams,
  isCommentReplyParams,
  MAX_COMMENT_REPLY_LENGTH,
} from "../packages/contracts/src/rpc/comments";
import { listComments, readCommentPage, replyComment } from "../packages/netease/src/endpoints/comments";
import { CommentPageCache } from "../plugins/community/src/comment-cache";
import { commentQueryKey, loadCommentPage } from "../plugins/community/src/comment-query";
import { commentDates, commentEntry } from "../plugins/community/src/comments-data";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "comment-test-session" };
const params = { start: 0, span: 20 };

/** Controlled requests expose duplicate loads and responses arriving after invalidation */
function deferredPage() {
  let resolve!: (result: RpcResult<CommentPage>) => void;
  const promise = new Promise<RpcResult<CommentPage>>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const row = {
  _id: "67cc0123abc",
  iid: "4686664860310207622",
  nickname: "玩家",
  uid: "12345",
  res_name: "组件",
  stars: "5",
  publish_time: 1792022400,
  user_comment: "喜欢这个组件",
  comment_tag: "默认类型",
};

/** Source pages place the only two matching ratings on opposite sides of the server page boundary */
function ratingRows(length = 30): CommentPage["items"] {
  return Array.from({ length }, (_, index) => ({
    id: `comment-${index}`,
    resourceId: row.iid,
    nickname: row.nickname,
    uid: row.uid,
    work: row.res_name,
    content: row.user_comment,
    tag: row.comment_tag,
    publishTime: row.publish_time,
    stars: index === 0 || index === 21 ? 1 : 5,
    canReply: true,
  }));
}

test("rating matches across server pages appear together on a single display page", async () => {
  const cache = new CommentPageCache();
  const items = ratingRows();
  const starts: number[] = [];
  const result = await loadCommentPage(cache, params, [1], async (input) => {
    starts.push(input.start);
    assert.equal("stars" in input, false);
    return { ok: true, value: { total: items.length, items: items.slice(input.start, input.start + input.span) } };
  });
  assert.ok(result.ok);
  assert.deepEqual(starts, [0, 20]);
  assert.equal(result.value.total, 2);
  assert.deepEqual(
    result.value.items.map((item) => item.id),
    ["comment-0", "comment-21"],
  );
});

test("rating pagination slices after filtering and shares the source snapshot between ratings and pages", async () => {
  const cache = new CommentPageCache();
  const items = ratingRows();
  let calls = 0;
  const load = async (input: typeof params): Promise<RpcResult<CommentPage>> => {
    calls++;
    return { ok: true, value: { total: items.length, items: items.slice(input.start, input.start + input.span) } };
  };
  const first = await loadCommentPage(cache, params, [5], load);
  const second = await loadCommentPage(cache, { ...params, start: 20 }, [5], load);
  const empty = await loadCommentPage(cache, params, [3], load);
  assert.ok(first.ok && second.ok && empty.ok);
  assert.equal(first.value.total, 28);
  assert.equal(first.value.items.length, 20);
  assert.equal(second.value.items.length, 8);
  assert.equal(new Set([...first.value.items, ...second.value.items].map((item) => item.id)).size, 28);
  assert.deepEqual(empty.value, { total: 0, items: [] });
  assert.equal(calls, 2);
  cache.expire();
  await loadCommentPage(cache, params, [1], load);
  assert.equal(calls, 4);
});

test("failed later source pages never display partial rating totals and can be retried", async () => {
  const cache = new CommentPageCache();
  const items = ratingRows();
  const failed = await loadCommentPage(cache, params, [1], async (input) =>
    input.start === 0
      ? { ok: true, value: { total: 30, items: items.slice(0, 20) } }
      : { ok: false, error: { kind: "network", message: "offline" } },
  );
  assert.equal(failed.ok, false);
  const retry = await loadCommentPage(cache, params, [1], async (input) => ({
    ok: true,
    value: { total: 30, items: items.slice(input.start, input.start + input.span) },
  }));
  assert.ok(retry.ok);
  assert.equal(retry.value.total, 2);
});

test("rating query keys normalize multiselect order and isolate account and server filters", async () => {
  assert.equal(commentQueryKey(params, [5, 1]), commentQueryKey(params, [1, 5]));
  assert.notEqual(commentQueryKey(params, []), commentQueryKey(params, [1]));
  const cache = new CommentPageCache();
  const seen: string[] = [];
  for (const source of [{ account: "a" }, { account: "b" }, { account: "b", keyword: "search" }]) {
    await loadCommentPage(cache, { ...params, ...source }, [1], async (input) => {
      seen.push(JSON.stringify(input));
      return { ok: true, value: { total: 0, items: [] } };
    });
  }
  assert.equal(new Set(seen).size, 3);
});

test("without ratings only the requested server page is loaded", async () => {
  const input = { ...params, start: 20 };
  let calls = 0;
  await loadCommentPage(new CommentPageCache(), input, [], async (source) => {
    assert.deepEqual(source, input);
    calls++;
    return { ok: true, value: { total: 30, items: ratingRows().slice(20) } };
  });
  assert.equal(calls, 1);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("pagination and date validators reject malformed queries", () => {
  assert.equal(isCommentListParams(params), true);
  for (const input of [
    null,
    [],
    {},
    { ...params, start: -1 },
    { ...params, start: 0.5 },
    { ...params, span: 101 },
    { ...params, keyword: " " },
    { ...params, tag: 1 },
    { ...params, tag: "默认类型" },
    { ...params, tag: "10__20" },
    { ...params, tag: "999" },
    { ...params, account: "" },
    { ...params, startDate: "2026-10-15" },
    { ...params, startDate: "2026-02-30", endDate: "2026-03-01" },
    { ...params, startDate: "2026-10-15", endDate: "2026-10-01" },
  ]) {
    assert.equal(isCommentListParams(input), false);
  }
  assert.equal(isCommentListParams({ ...params, startDate: "2024-02-29", endDate: "2024-03-01" }), true);
});

test("list queries preserve filters and pagination without adding a rating query", async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/items/comment/pe/");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      start: "20",
      span: "20",
      fuzzy_key: "玩家 & 组件",
      comment_tag: "10",
      start_date: "20261001",
      end_date: "20261015",
    });
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("Cookie"), "NTES_SESS=comment-test-session");
    return new Response(JSON.stringify({ status: "ok", data: { count: 21, data: [row] } }));
  };
  const result = await listComments(session, {
    start: 20,
    span: 20,
    keyword: "玩家 & 组件",
    tag: "10",
    startDate: "2026-10-01",
    endDate: "2026-10-15",
  });
  assert.ok(result.ok);
  assert.equal(result.value.total, 21);
  assert.equal(result.value.items[0]?.resourceId, row.iid);
  assert.equal(result.value.items[0]?.stars, 5);
  assert.equal("reply" in (result.value.items[0] ?? {}), false);
});

test("all official comment labels use numeric query codes, including default type zero", async () => {
  for (const { code, label } of commentTypes) {
    globalThis.fetch = async (input) => {
      const query = new URL(String(input)).searchParams;
      assert.equal(query.get("comment_tag"), code);
      assert.notEqual(query.get("comment_tag"), label);
      return new Response(JSON.stringify({ status: "ok", data: { count: 1, data: [{ ...row, comment_tag: label }] } }));
    };
    const result = await listComments(session, { ...params, tag: code });
    assert.ok(result.ok);
    assert.equal(result.value.items[0]?.tag, label);
  }
});

test("the screenshot's Chinese-label query is rejected before reaching the platform", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Should not request");
  };
  // Simulate an older or malformed renderer bypassing TypeScript
  const invalid = JSON.parse('{"start":0,"span":20,"tag":"默认类型"}');
  const result = await listComments(session, invalid);
  assert.ok(!result.ok);
  assert.equal(calls, 0);
});

test("all-time queries omit filters and preserve unquoted 64-bit identifiers", async () => {
  globalThis.fetch = async (input) => {
    assert.deepEqual(Object.fromEntries(new URL(String(input)).searchParams), { start: "0", span: "20" });
    const text = JSON.stringify({ status: "ok", data: { count: 1, data: [row] } }).replace(`"${row.iid}"`, row.iid);
    return new Response(text);
  };
  const result = await listComments(session, params);
  assert.ok(result.ok);
  assert.equal(result.value.items[0]?.resourceId, row.iid);
});

test("empty pages succeed while corrupt records fail visibly", () => {
  assert.deepEqual(readCommentPage({ count: 0, data: [] }), { ok: true, value: { total: 0, items: [] } });
  for (const value of [
    {},
    { count: -1, data: [] },
    { count: 1, data: null },
    { count: 1, data: [null] },
    { count: 2, data: [row, row] },
    { count: 1, data: [{ ...row, stars: "bad" }] },
    { count: 1, data: [{ ...row, publish_time: 1e20 }] },
  ]) {
    assert.equal(readCommentPage(value).ok, false);
  }
  assert.equal(
    readCommentPage({ count: 1, data: [{ ...row, comment_tag: "", user_comment: "", stars: "0" }] }).ok,
    true,
  );
});

test("session and network failures propagate and invalid queries never request", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ status: "no_login" }));
  };
  assert.deepEqual(await listComments(session, params), { ok: false, error: { kind: "session_expired" } });
  assert.equal((await listComments(session, { ...params, span: 0 })).ok, false);
  assert.equal(calls, 1);
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  const result = await listComments(session, params);
  assert.ok(!result.ok);
  assert.equal(result.error.kind, "network");
});

test("relative dates use the current local calendar across month and year boundaries", () => {
  const now = new Date(2026, 0, 3, 1, 15);
  assert.deepEqual(commentDates("全部", now), {});
  assert.deepEqual(commentDates("今天", now), { startDate: "2026-01-03", endDate: "2026-01-03" });
  assert.deepEqual(commentDates("近 7 天", now), { startDate: "2025-12-28", endDate: "2026-01-03" });
  assert.deepEqual(commentDates("近 30 天", new Date(2024, 2, 1)), { startDate: "2024-02-01", endDate: "2024-03-01" });
  assert.deepEqual(commentDates("近 90 天", new Date(2026, 9, 15)), { startDate: "2026-07-18", endDate: "2026-10-15" });
});

test("comment timestamps are seconds and real replies require a write capability", () => {
  const publishTime = new Date(2026, 9, 15, 14, 30).getTime() / 1000;
  const page = readCommentPage({ count: 1, data: [{ ...row, publish_time: publishTime }] });
  assert.ok(page.ok);
  const comment = page.value.items[0];
  assert.ok(comment);
  const entry = commentEntry(comment);
  assert.equal(entry.createdAt, "2026-10-15 14:30");
  assert.equal(entry.canReply, true);
  assert.equal(entry.reply, undefined);
  assert.deepEqual(capabilities["comments.list"], {
    caller: "shell",
    permission: "netease:community.read",
    risk: "read",
  });
  assert.deepEqual(capabilities["comments.reply"], {
    caller: "shell",
    permission: "netease:community.write",
    risk: "write",
  });
});

test("reply validation rejects missing accounts, unsafe ids, blank and overlong content", async () => {
  const valid = { account: "test-account", id: row._id, content: "谢谢反馈" };
  assert.equal(isCommentReplyParams(valid), true);
  assert.equal(isCommentReplyParams({ ...valid, content: "字".repeat(MAX_COMMENT_REPLY_LENGTH) }), true);
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw new Error("Unexpected request");
  };
  for (const input of [
    null,
    [],
    {},
    { ...valid, account: "" },
    { ...valid, account: " " },
    { ...valid, id: "../users/me" },
    { ...valid, id: "%2f" },
    { ...valid, content: " \n " },
    { ...valid, content: "字".repeat(MAX_COMMENT_REPLY_LENGTH + 1) },
  ]) {
    assert.equal(isCommentReplyParams(input), false);
    assert.equal((await replyComment(session, input as typeof valid)).ok, false);
  }
  assert.equal(requests, 0);
});

test("reply sends exactly one authenticated PUT with the GitHub ReplyDTO and accepts empty data", async () => {
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    requests++;
    assert.equal(new URL(String(input)).pathname, `/items/comment/pe/${row._id}/reply`);
    assert.equal(init?.method, "PUT");
    assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).get("Cookie"), "NTES_SESS=comment-test-session");
    assert.deepEqual(JSON.parse(String(init?.body)), { content: "谢谢反馈\n正在排查" });
    return new Response(JSON.stringify({ status: "ok", data: null }));
  };
  assert.deepEqual(
    await replyComment(session, { account: "test-account", id: row._id, content: " 谢谢反馈\n正在排查 " }),
    { ok: true, value: undefined },
  );
  assert.equal(requests, 1);
});

test("reply failures and redirects are never silently retried or reported as success", async () => {
  const reply = { account: "test-account", id: row._id, content: "测试回复" };
  for (const failure of ["business", "network", "session_expired", "redirect", "parse"]) {
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      if (failure === "network") throw new Error("offline");
      if (failure === "redirect")
        return new Response(null, {
          status: 307,
          headers: { location: "https://mc-launcher.webapp.163.com/elsewhere" },
        });
      if (failure === "parse") return new Response("not json");
      return new Response(
        JSON.stringify({ status: failure === "session_expired" ? "no_login" : "error", msg: "回复被拒绝" }),
      );
    };
    const result = await replyComment(session, reply);
    assert.ok(!result.ok);
    assert.equal(result.error.kind, failure === "redirect" ? "business" : failure);
    assert.equal(requests, 1);
  }
});

test("discussion counts do not mark the current account as replied", () => {
  for (const developer_reply of [undefined, null, []]) {
    const result = readCommentPage({ count: 1, data: [{ ...row, developer_reply, commented_num: 3 }] });
    assert.ok(result.ok);
    assert.equal(result.value.items[0]?.canReply, true);
    assert.equal(result.value.items[0]?.reply, undefined);
  }
});

test("account reply content is displayed independently of the discussion count", () => {
  for (const commented_num of [undefined, 0, 3]) {
    const fields = { developer_reply: [{ comment: "已收到反馈" }], commented_num };
    const result = readCommentPage({ count: 1, data: [{ ...row, ...fields }] });
    assert.ok(result.ok);
    assert.equal(result.value.items[0]?.canReply, false);
    assert.deepEqual(result.value.items[0]?.reply, { content: "已收到反馈", createdAt: "" });
  }
  const result = readCommentPage({ count: 1, data: [{ ...row, developer_reply: [], commented_num: 0 }] });
  assert.ok(result.ok);
  assert.equal(result.value.items[0]?.canReply, true);
});

test("missing reply text never invents content or hides later available text", () => {
  for (const developer_reply of [[{}], [{ comment: " " }], [{ comment: 123 }]]) {
    const result = readCommentPage({ count: 1, data: [{ ...row, developer_reply }] });
    assert.ok(result.ok);
    assert.equal(result.value.items[0]?.canReply, false);
    assert.equal(result.value.items[0]?.reply, undefined);
  }
  const result = readCommentPage({ count: 1, data: [{ ...row, developer_reply: [{}, { comment: "我的回复" }] }] });
  assert.ok(result.ok);
  assert.deepEqual(result.value.items[0]?.reply, { content: "我的回复", createdAt: "" });
});

test("the same comment uses replies from each authenticated account's response", async () => {
  globalThis.fetch = async (_input, init) => {
    const cookie = new Headers(init?.headers).get("Cookie");
    const developer_reply = cookie === "NTES_SESS=account-a" ? [{ comment: "账号 A 的回复" }] : null;
    return new Response(
      JSON.stringify({ status: "ok", data: { count: 1, data: [{ ...row, commented_num: 2, developer_reply }] } }),
    );
  };
  const first = await listComments({ sessionCookie: "account-a" }, { ...params, account: "a" });
  const second = await listComments({ sessionCookie: "account-b" }, { ...params, account: "b" });
  assert.ok(first.ok && second.ok);
  assert.equal(first.value.items[0]?.canReply, false);
  assert.equal(first.value.items[0]?.reply?.content, "账号 A 的回复");
  assert.equal(second.value.items[0]?.canReply, true);
  assert.equal(second.value.items[0]?.reply, undefined);
});

test("identical in-flight reads share one request, including effect replay", async () => {
  const cache = new CommentPageCache();
  const deferred = deferredPage();
  let calls = 0;
  const load = () => {
    calls++;
    return deferred.promise;
  };
  const first = cache.read("page-1", load);
  const repeated = cache.read("page-1", load);
  assert.equal(first, repeated);
  await Promise.resolve();
  assert.equal(calls, 1);
  deferred.resolve({ ok: true, value: { total: 0, items: [] } });
  await first;
});

test("revisiting a page within 30 seconds avoids a request; expired rows remain available", async () => {
  let time = 1000;
  let calls = 0;
  const cache = new CommentPageCache(() => time);
  const data = { total: 0, items: [] };
  const load = async (): Promise<RpcResult<CommentPage>> => {
    calls++;
    return { ok: true, value: data };
  };
  await cache.read("page-1", load);
  time += 29_999;
  assert.equal(cache.fresh("page-1"), true);
  await cache.read("page-1", load);
  assert.equal(calls, 1);
  time++;
  assert.equal(cache.fresh("page-1"), false);
  assert.equal(cache.peek("page-1"), data);
  await cache.read("page-1", load);
  assert.equal(calls, 2);
});

test("manual refresh requests fresh data while repeated refreshes share the pending read", async () => {
  const cache = new CommentPageCache();
  await cache.read("page-1", async () => ({ ok: true, value: { total: 0, items: [] } }));
  cache.expire();
  assert.equal(cache.fresh("page-1"), false);
  const deferred = deferredPage();
  const pending = cache.read("page-1", () => deferred.promise);
  cache.expire();
  assert.equal(
    cache.read("page-1", () => {
      throw new Error("Duplicate request");
    }),
    pending,
  );
  deferred.resolve({ ok: true, value: { total: 1, items: [] } });
  await pending;
  assert.equal(cache.peek("page-1")?.total, 1);
});

test("reply invalidation prevents an old pending read from repopulating cached replies", async () => {
  const cache = new CommentPageCache();
  const old = deferredPage();
  const pending = cache.read("page-1", () => old.promise);
  cache.clear();
  await cache.read("page-1", async () => ({ ok: true, value: { total: 2, items: [] } }));
  old.resolve({ ok: true, value: { total: 1, items: [] } });
  await pending;
  assert.equal(cache.peek("page-1")?.total, 2);
});

test("failures preserve rows but never become fresh cache entries or block retry", async () => {
  const cache = new CommentPageCache();
  await cache.read("page-1", async () => ({ ok: true, value: { total: 4, items: [] } }));
  cache.expire();
  const failed = await cache.read("page-1", () => {
    throw new Error("offline");
  });
  assert.equal(failed.ok, false);
  assert.equal(cache.peek("page-1")?.total, 4);
  assert.equal(cache.fresh("page-1"), false);
  const retry = await cache.read("page-1", async () => ({ ok: true, value: { total: 5, items: [] } }));
  assert.equal(retry.ok, true);
  assert.equal(cache.peek("page-1")?.total, 5);
});

test("query keys and account cache instances are isolated and least recently used pages are evicted", async () => {
  const cache = new CommentPageCache(Date.now, 30_000, 2);
  const otherAccount = new CommentPageCache();
  const load = async (): Promise<RpcResult<CommentPage>> => ({ ok: true, value: { total: 0, items: [] } });
  await cache.read("page-1", load);
  await cache.read("page-2", load);
  await cache.read("page-1", load);
  await cache.read("filtered-page", load);
  assert.equal(cache.peek("page-2"), null);
  assert.notEqual(cache.peek("page-1"), null);
  assert.equal(otherAccount.peek("page-1"), null);
});
