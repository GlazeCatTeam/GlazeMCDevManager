import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { isMessageId, isMessageIds, isMessageListParams } from "../packages/contracts/src/rpc/messages";
import {
  deleteMessages,
  getMessage,
  getMessageUnreadCount,
  listMessages,
  markAllMessagesRead,
  readMessagePage,
} from "../packages/netease/src/endpoints/messages";
import { messageText } from "../plugins/messages/src/data";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "messages-test-only" };
const id = "507f1f77bcf86cd799439011";
const row = { _id: id, have_read: false, title: "审核通知", time: "2026-10-15 12:00", mail_type: "review_notice" };
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Simulate the documented platform envelope without using account credentials */
function response(data: unknown, status = "ok"): Response {
  return new Response(JSON.stringify({ status, data }));
}

test("mailbox validators reject malformed pagination, filters, duplicate IDs and path injection", () => {
  assert.equal(isMessageId(id), true);
  for (const value of ["../users", "a/b", "id?x=1", "", null]) assert.equal(isMessageId(value), false);
  assert.equal(isMessageIds([id, id]), false);
  assert.equal(isMessageIds([]), false);
  assert.equal(isMessageIds([id]), true);
  for (const value of [
    null,
    [],
    { start: -1 },
    { start: 0.5 },
    { span: 101 },
    { read: "false" },
    { type: "other" },
    { title: "x".repeat(201) },
  ])
    assert.equal(isMessageListParams(value), false);
  assert.equal(isMessageListParams({ read: false, title: "", type: "notify", start: 20 }), true);
});

test("list parser preserves unknown types and missing counts without inventing zero", () => {
  const result = readMessagePage({
    count: 35,
    mail: [row, { ...row, _id: "new-id", mail_type: "new_type" }],
    unread_count: 10,
    unread_mail_counts: { review_notice: 0 },
  });
  assert.ok(result.ok);
  assert.equal(result.value.total, 35);
  assert.equal(result.value.messages[1]?.type, "new_type");
  assert.equal(result.value.unreadByType.review_notice, 0);
  assert.equal(result.value.unreadByType.system_notice, null);
  for (const value of [
    {},
    { count: -1, mail: [] },
    { count: 1, mail: [{}] },
    { count: 2, mail: [row, row] },
    { count: 1, mail: [{ ...row, have_read: "false" }] },
  ])
    assert.equal(readMessagePage(value).ok, false);
  assert.ok(readMessagePage({ count: 0, mail: [] }).ok);
});

test("list sends filters, offset, aggregates and session only to the documented endpoint", async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/mailbox");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      start: "20",
      span: "20",
      initLoad: "true",
      title: "通知",
      have_read: "false",
      mail_type: "review_notice",
    });
    assert.equal(new Headers(init?.headers).get("Cookie"), "NTES_SESS=messages-test-only");
    assert.equal(init?.method, "GET");
    return response({ count: 21, mail: [row] });
  };
  assert.ok((await listMessages(session, { start: 20, title: " 通知 ", read: false, type: "review_notice" })).ok);
});

test("all filters omit optional query fields and malformed params make no requests", async () => {
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.has("have_read"), false);
    assert.equal(url.searchParams.has("mail_type"), false);
    assert.equal(url.searchParams.has("title"), false);
    return response({ count: 0, mail: [] });
  };
  assert.ok((await listMessages(session, {})).ok);
  assert.equal((await listMessages(session, { span: 0 })).ok, false);
  assert.equal((await deleteMessages(session, ["../users"])).ok, false);
  assert.equal((await getMessage(session, "../users")).ok, false);
  assert.equal(calls, 1);
});

test("detail opens with exactly one GET and accepts empty text and optional extras", async () => {
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(new URL(String(input)).pathname, `/mailbox/${id}`);
    assert.equal(init?.method, "GET");
    return response({ detail: "", sender: "平台" });
  };
  assert.deepEqual(await getMessage(session, id), { ok: true, value: { text: "", sender: "平台", extra: [] } });
  assert.equal(calls, 1);
  globalThis.fetch = async () => response({ detail: "内容", extra_list: [{}] });
  assert.equal((await getMessage(session, id)).ok, false);
});

test("writes preserve trailing slash, explicit DTO fields and empty successful responses", async () => {
  const calls: { path: string; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "manual");
    calls.push({ path: new URL(String(input)).pathname, body: JSON.parse(String(init?.body)) });
    return response(null);
  };
  assert.ok((await markAllMessagesRead(session)).ok);
  assert.ok((await deleteMessages(session, [id])).ok);
  assert.deepEqual(calls, [
    { path: "/mailbox/read_mail/", body: { mail_id_list: [], read_all: true } },
    { path: "/mailbox/delete_many/", body: { mail_id_list: [id] } },
  ]);
});

test("expired, rejected and redirected mutations fail without retry", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response(null, "no_login");
  };
  const expired = await listMessages(session, {});
  assert.ok(!expired.ok && expired.error.kind === "session_expired");
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: "/mailbox/delete_many/" } });
  };
  assert.equal((await deleteMessages(session, [id])).ok, false);
  assert.equal(calls, 2);
  globalThis.fetch = async () => response(null, "rejected");
  assert.equal((await markAllMessagesRead(session)).ok, false);
});

test("unread count distinguishes a real zero from an invalid response", async () => {
  globalThis.fetch = async (input) => {
    assert.equal(new URL(String(input)).pathname, "/mailbox/unread/count");
    return response({ count: 0 });
  };
  assert.deepEqual(await getMessageUnreadCount(session), { ok: true, value: 0 });
  globalThis.fetch = async () => response({});
  assert.equal((await getMessageUnreadCount(session)).ok, false);
});

test("message text removes active markup and keeps useful paragraphs", () => {
  assert.equal(
    messageText("<p>正文 &amp; 信息</p><script>alert(1)</script><style>p{}</style><p>第二段<br>第三行</p>"),
    "正文 & 信息\n第二段\n第三行",
  );
});
