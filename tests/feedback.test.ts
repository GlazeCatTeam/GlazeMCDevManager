import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { FeedbackPageData, PlayerFeedback, RpcResult } from "../packages/contracts/src";
import { capabilities } from "../packages/contracts/src/rpc/capabilities";
import { isFeedbackListParams, isFeedbackReplyParams } from "../packages/contracts/src/rpc/feedback";
import {
  isFeedbackAttachmentUrl,
  listFeedback,
  readFeedbackLog,
  readFeedbackPage,
  replyFeedback,
} from "../packages/netease/src/endpoints/feedback";
import { filterFeedbackPage, loadAllFeedback } from "../plugins/community/src/feedback-query";
import { createFeedbackLoader } from "../plugins/community/src/feedback-requests";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "feedback-test-session" };
const row = {
  _id: "670df123abc456def7890123",
  commit_nickname: "测试玩家",
  commit_uid: "4686664860310207622",
  content: "传送门无法打开",
  create_time: 1792022400,
  feedback_log_file: "https://x19.fp.ps.netease.com/log.txt",
  forbid_reply: false,
  pic_list: [null, "https://x19.fp.ps.netease.com/screenshot.png"],
  reply: null,
  res_name: "测试组件",
  type: "0",
};

test("reply filtering collects all source pages before counting and slicing matches", async () => {
  const entries: PlayerFeedback[] = Array.from({ length: 125 }, (_, index) => ({
    id: String(index),
    nickname: "玩家",
    uid: String(index),
    work: "组件",
    content: "反馈",
    createdAt: "",
    canReply: true,
    type: "故障问题",
    images: [],
    conflicts: [],
    ...([0, 100, 124].includes(index) ? { reply: { content: "已回复", createdAt: "" } } : {}),
  }));
  const starts: number[] = [];
  const result = await loadAllFeedback(
    { account: "a", start: 20, span: 20, type: "0", search: "组件" },
    async (params) => {
      starts.push(params.start);
      assert.equal(params.type, "0");
      assert.equal(params.search, "组件");
      assert.equal(params.account, "a");
      return {
        ok: true,
        value: { total: entries.length, entries: entries.slice(params.start, params.start + params.span) },
      };
    },
    () => true,
  );
  assert.ok(result?.ok);
  assert.deepEqual(starts, [0, 100]);
  const replied = filterFeedbackPage(result.value.entries, "已回复", 0, 20);
  assert.equal(replied.total, 3);
  assert.deepEqual(
    replied.entries.map((entry) => entry.id),
    ["0", "100", "124"],
  );
  const unread = filterFeedbackPage(result.value.entries, "未回复", 1, 20);
  assert.equal(unread.total, 122);
  assert.equal(unread.entries.length, 20);
  assert.equal(unread.entries[0]?.id, "21");
});

test("incomplete or failed full feedback reads cannot publish partial filtered totals", async () => {
  for (const failure of [false, true]) {
    const result = await loadAllFeedback(
      { start: 0, span: 20 },
      async ({ start }) => {
        if (start === 0) {
          const parsed = readFeedbackPage({ data: [row], count: 2 });
          assert.ok(parsed.ok);
          return parsed;
        }
        return failure
          ? { ok: false, error: { kind: "network", message: "offline" } }
          : { ok: true, value: { entries: [], total: 2 } };
      },
      () => true,
    );
    assert.equal(result?.ok, false);
  }
});

test("obsolete full feedback queries stop requesting more pages", async () => {
  let active = true;
  let calls = 0;
  const result = await loadAllFeedback(
    { start: 0, span: 20 },
    async () => {
      calls++;
      active = false;
      return readFeedbackPage({ data: [row], count: 200 });
    },
    () => active,
  );
  assert.equal(result, null);
  assert.equal(calls, 1);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("concurrent identical reads share one request, while refresh after completion fetches fresh data", async () => {
  let calls = 0;
  const gate = Promise.withResolvers<RpcResult<FeedbackPageData>>();
  const load = createFeedbackLoader(async () => {
    calls++;
    return gate.promise;
  });
  const params = { account: "a", start: 0, span: 20 };
  const first = load(params);
  const second = load({ ...params });
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  gate.resolve({ ok: true, value: { entries: [], total: 0 } });
  await first;
  await load(params);
  assert.equal(calls, 2);
});

test("pending feedback reads are isolated by account, filter and page", async () => {
  let calls = 0;
  const gate = Promise.withResolvers<RpcResult<FeedbackPageData>>();
  const load = createFeedbackLoader(async () => {
    calls++;
    return gate.promise;
  });
  const params = { account: "a", start: 0, span: 20 };
  const requests = [
    load(params),
    load({ ...params, account: "b" }),
    load({ ...params, start: 20 }),
    load({ ...params, type: "4" }),
    load({ ...params, search: "组件" }),
  ];
  await Promise.resolve();
  assert.equal(calls, 5);
  gate.resolve({ ok: true, value: { entries: [], total: 0 } });
  await Promise.all(requests);
});

test("failed or rejected reads release their pending slot for a real retry", async () => {
  let calls = 0;
  const load = createFeedbackLoader(async () => {
    calls++;
    if (calls === 1) throw new Error("bridge unavailable");
    if (calls === 2) return { ok: false, error: { kind: "network", message: "offline" } };
    return { ok: true, value: { entries: [], total: 0 } };
  });
  const params = { account: "a", start: 0, span: 20 };
  await assert.rejects(load(params), /bridge unavailable/);
  assert.equal((await load(params)).ok, false);
  assert.equal((await load(params)).ok, true);
  assert.equal(calls, 3);
});

/** Build a platform envelope without live traffic */
function response(data: unknown, status = "ok"): Response {
  return new Response(JSON.stringify({ status, data }));
}

test("list and reply validation reject unsafe identifiers and unbounded input", () => {
  assert.ok(isFeedbackListParams({ start: 0, span: 20, type: "6" }));
  for (const params of [
    { start: -1, span: 20 },
    { start: 0, span: 101 },
    { start: 0.5, span: 20 },
    { start: 0, span: 20, type: "7" },
    { start: 0, span: 20, search: "a".repeat(201) },
  ])
    assert.equal(isFeedbackListParams(params), false);
  const valid = { account: "account-a", id: row._id, content: "收到，我们会修复" };
  assert.ok(isFeedbackReplyParams(valid));
  for (const patch of [
    { account: "" },
    { id: "../other" },
    { id: "a?b" },
    { content: "  " },
    { content: "a".repeat(501) },
  ])
    assert.equal(isFeedbackReplyParams({ ...valid, ...patch }), false);
  assert.equal(capabilities["feedback.reply"].risk, "write");
  assert.equal(capabilities["feedback.reply"].mcp, undefined);
});

test("feedback preserves identifiers, timezone, attachments and reply restrictions", () => {
  const result = readFeedbackPage({
    data: [
      row,
      { ...row, _id: "blocked", forbid_reply: true },
      { ...row, _id: "replied", reply: "已修复", type: "99" },
    ],
    count: 3,
  });
  assert.ok(result.ok);
  assert.equal(result.value.entries[0]?.uid, row.commit_uid);
  assert.equal(result.value.entries[0]?.createdAt, "2026-10-15 08:00:00");
  assert.equal(result.value.entries[0]?.images.length, 1);
  assert.equal(result.value.entries[0]?.log?.url, row.feedback_log_file);
  assert.equal(result.value.entries[1]?.canReply, false);
  assert.equal(result.value.entries[2]?.reply?.content, "已修复");
  assert.equal(result.value.entries[2]?.reply?.createdAt, "");
  assert.equal(result.value.entries[2]?.type, "未知类型");
});

test("malformed pages fail and empty/conflict pages remain meaningful", () => {
  for (const value of [
    {},
    { data: [], count: -1 },
    { data: [row, row], count: 2 },
    { data: [{ ...row, create_time: "bad" }], count: 1 },
    { data: [{ ...row, forbid_reply: "false" }], count: 1 },
  ])
    assert.equal(readFeedbackPage(value).ok, false);
  assert.deepEqual(readFeedbackPage({ data: [], count: 0 }), { ok: true, value: { entries: [], total: 0 } });
  const result = readFeedbackPage({
    data: [{ ...row, type: "4", content: JSON.stringify({ item_list: [{ name: "冲突组件" }], detail: "联机闪退" }) }],
    count: 1,
  });
  assert.ok(result.ok);
  assert.equal(result.value.entries[0]?.content, "联机闪退");
  assert.deepEqual(result.value.entries[0]?.conflicts, ["冲突组件"]);
});

test("list sends the real paging/category/search keys with the account cookie", async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/items/feedback/pe/");
    assert.equal(url.searchParams.get("start"), "20");
    assert.equal(url.searchParams.get("span"), "20");
    assert.equal(url.searchParams.get("type"), "0");
    assert.equal(url.searchParams.get("fuzzy_key"), "测试 & 组件");
    assert.equal(url.searchParams.has("reply_count"), false);
    assert.equal(new Headers(init?.headers).get("Cookie"), "NTES_SESS=feedback-test-session");
    return response({ data: [row], count: 21 });
  };
  const result = await listFeedback(session, { start: 20, span: 20, type: "0", search: "测试 & 组件" });
  assert.ok(result.ok);
  assert.equal(result.value.total, 21);
});

test("reply sends content exactly once and propagates platform rejection", async () => {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(new URL(String(input)).pathname, `/items/feedback/pe/${row._id}/reply`);
    assert.equal(init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(init?.body)), { content: "收到" });
    return response(null);
  };
  assert.deepEqual(await replyFeedback(session, { account: "a", id: row._id, content: " 收到 " }), {
    ok: true,
    value: undefined,
  });
  assert.equal(calls, 1);
  assert.equal((await replyFeedback(session, { account: "a", id: "../bad", content: "收到" })).ok, false);
  assert.equal(calls, 1);
  globalThis.fetch = async () => response(null, "no_login");
  const failure = await replyFeedback(session, { account: "a", id: row._id, content: "收到" });
  assert.ok(!failure.ok);
  assert.equal(failure.error.kind, "session_expired");
});

test("log previews reject unsafe URLs, oversized bodies and binary archives", async () => {
  for (const url of [
    "http://x19.fp.ps.netease.com/a",
    "https://localhost/a",
    "https://netease.com.evil.test/a",
    "https://u:p@x19.fp.ps.netease.com/a",
    "https://x19.fp.ps.netease.com:444/a",
  ])
    assert.equal(isFeedbackAttachmentUrl(url), false);
  globalThis.fetch = async (_input, init) => {
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).has("Cookie"), false);
    return new Response("日志内容");
  };
  assert.deepEqual(await readFeedbackLog(row.feedback_log_file), { ok: true, value: "日志内容" });
  globalThis.fetch = async () => new Response("a".repeat(1024 * 1024 + 1));
  assert.equal((await readFeedbackLog(row.feedback_log_file)).ok, false);
  globalThis.fetch = async () => new Response("PK\u0003\u0004archive");
  assert.equal((await readFeedbackLog(row.feedback_log_file)).ok, false);
});
