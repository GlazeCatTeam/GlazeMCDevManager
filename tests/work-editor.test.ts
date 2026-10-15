import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { validateWorkVideo } from "../apps/desktop/src/main/ipc/work-video";
import { isWorkSaveParams } from "../packages/contracts/src/rpc/work-editor";
import {
  buildWorkUpdate,
  getWorkEditorOptions,
  readWorkEditor,
  saveWorkEditor,
  submitWorkReview,
  validateWorkPatch,
  workEditorFields,
} from "../packages/netease/src/endpoints/work-editor";
import {
  parseWorkUploadReply,
  resolveWorkUploadUrl,
  uploadWorkFile,
} from "../packages/netease/src/endpoints/work-upload";
import { getMcDevData, parsePlatformJson, writeMcDevData } from "../packages/netease/src/http/client";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "unit-test-session" };
const itemId = "4686664860310207622";
const fixture = {
  item_id: itemId,
  item_name: "测试模组",
  status: "online",
  item_version: "3.4",
  normal_number: "4383863",
  tags: [{ name: "魔法", source: 0 }],
  info: "<p>原介绍</p>",
  activity_desc: "私有活动说明",
  price_type: "free",
  price: 0,
  price_rank: -4,
  pri_type: 2,
  sub_type: 2,
  sync_pc_flag: false,
  is_original: true,
  pe_is_add_play_plan: true,
  play_plan_expire_time: 4102444800,
  relate_item_id: "4669876470260845864",
  mc_version: '["1.21"]',
  whitelist: '["player-1"]',
  dlc_info: { dlc_switch: false, dlc_type: "off", master: "{}", slave_list: "[]" },
  res: [
    {
      res_name: "existing.zip",
      res_url: "",
      add_version: false,
      cdn_info: { token: "platform-resource-metadata" },
      res_id: 42,
    },
  ],
  channel: [{ channel_id: 5, channel_url: "https://x19.fp.ps.netease.com/icon.png", version: 2 }],
  guide_list: [{ guide_id: "guide-1", title: "现有攻略", status: "online", unknown_property: "preserve" }],
  discount: [{ begin_at: 1, discount: 80 }],
  online_time: "response-only",
  server_private_response: "do not send",
};

/** All network calls in these tests terminate at an in-memory response */
function mockFetch(respond: (url: string, init: RequestInit, index: number) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const index = calls.length;
    calls.push({ url, init });
    return respond(url, init, index);
  };
  return calls;
}
/** Match the platform envelope, including writes with no data member */
function response(data?: unknown, status = "ok") {
  return new Response(JSON.stringify({ status, ...(data === undefined ? {} : { data }) }), {
    headers: { "content-type": "application/json" },
  });
}
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Construct tiny MP4 metadata fixtures without embedding real media files */
function videoFixture(seconds: number, width: number, height: number, codec = "avc1"): Buffer {
  const box = (name: string, data: Buffer) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(data.length + 8);
    header.write(name, 4);
    return Buffer.concat([header, data]);
  };
  const duration = Buffer.alloc(100);
  duration.writeUInt32BE(1000, 12);
  duration.writeUInt32BE(seconds * 1000, 16);
  const dimensions = Buffer.alloc(84);
  dimensions.writeUInt32BE(width * 65536, 76);
  dimensions.writeUInt32BE(height * 65536, 80);
  const description = Buffer.alloc(16);
  description.writeUInt32BE(1, 4);
  description.write(codec, 12);
  return box(
    "moov",
    Buffer.concat([
      box("mvhd", duration),
      box(
        "trak",
        Buffer.concat([box("tkhd", dimensions), box("mdia", box("minf", box("stbl", box("stsd", description))))]),
      ),
    ]),
  );
}

test("video metadata enforces duration, ratio, codec and container bounds", () => {
  assert.doesNotThrow(() => validateWorkVideo(videoFixture(90, 1920, 1080)));
  assert.throws(() => validateWorkVideo(videoFixture(91, 1920, 1080)), /时长/);
  assert.throws(() => validateWorkVideo(videoFixture(30, 1000, 1000)), /16:9/);
  assert.throws(() => validateWorkVideo(videoFixture(30, 1920, 1080, "hvc1")), /H.264/);
  const broken = videoFixture(30, 1920, 1080);
  broken.writeUInt32BE(broken.length + 1);
  assert.throws(() => validateWorkVideo(broken), /损坏/);
});

test("IPC rejects unknown fields, prototype keys and mismatched baselines", () => {
  assert.equal(isWorkSaveParams({ itemId, base: { item_name: "old" }, patch: { item_name: "new" } }), true);
  assert.equal(isWorkSaveParams({ itemId, base: {}, patch: { item_name: "new" } }), false);
  assert.equal(isWorkSaveParams({ itemId, base: { guide_list: [] }, patch: { guide_list: [] } }), false);
  assert.equal(
    isWorkSaveParams(JSON.parse(`{"itemId":"${itemId}","base":{"info":""},"patch":{"info":{"__proto__":{}}}}`)),
    false,
  );
});

test("64-bit identifiers survive response parsing without rounding", () => {
  assert.deepEqual(parsePlatformJson('{"relate_item_id":4669876470260845864,"queue_length":12}'), {
    relate_item_id: "4669876470260845864",
    queue_length: 12,
  });
});

test("partial update preserves resource metadata, guides, discount and play-plan state", () => {
  const body = buildWorkUpdate(fixture, { item_name: "新名称" });
  assert.equal(body.item_name, "新名称");
  assert.equal(body.info, fixture.info);
  assert.deepEqual(body.res, fixture.res);
  assert.deepEqual(body.guide_list, fixture.guide_list);
  assert.deepEqual(body.discount, fixture.discount);
  assert.equal(body.pe_is_add_play_plan, true);
  assert.deepEqual(body.tag, fixture.tags);
  assert.deepEqual(body.white_list, ["player-1"]);
  assert.deepEqual(body.mc_version, ["1.21"]);
  assert.equal(body.is_check_apply, false);
  assert.equal("online_time" in body, false);
  assert.equal("server_private_response" in body, false);
  assert.equal("sync_item_info" in body, false);
});

test("save uses the latest server snapshot and writes a numeric long id exactly once", async () => {
  const calls = mockFetch((_url, _init, index) =>
    index === 0 ? response({ ...fixture, activity_desc: "最新活动说明" }) : response(),
  );
  const result = await saveWorkEditor(session, {
    itemId,
    base: { item_name: fixture.item_name },
    patch: { item_name: "修改名称" },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.init.method, "POST");
  assert.match(calls[1]?.url ?? "", /\/update$/);
  assert.match(String(calls[1]?.init.body), /"relate_item_id":4669876470260845864/);
  assert.equal(JSON.parse(String(calls[1]?.init.body)).activity_desc, "最新活动说明");
  assert.equal(calls[1]?.init.redirect, "manual");
});

test("concurrent edits and read-only statuses prevent any POST", async () => {
  const calls = mockFetch(() => response({ ...fixture, item_name: "在其他客户端修改" }));
  const result = await saveWorkEditor(session, {
    itemId,
    base: { item_name: fixture.item_name },
    patch: { item_name: "不能覆盖" },
  });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 1);
  if (!result.ok) assert.equal(result.error.kind === "business" && result.error.code, "conflict");
  const lockedCalls = mockFetch(() => response({ ...fixture, status: "reviewing" }));
  const locked = await saveWorkEditor(session, { itemId, base: { info: fixture.info }, patch: { info: "修改" } });
  assert.equal(locked.ok, false);
  assert.equal(lockedCalls.length, 1);
});

test("preserved image URLs and signed upload receipts use distinct wire shapes", () => {
  const receipt = { body: '{"url":"https://x19.fp.ps.netease.com/new.png"}', file_type: "image", sign: "test-sign" };
  const channel = [{ channel_id: 5, channel_url: receipt, version: 3 }];
  assert.equal(validateWorkPatch({ channel }, workEditorFields(fixture)), null);
  assert.deepEqual(buildWorkUpdate(fixture, { channel }).channel, channel);
  assert.equal(
    validateWorkPatch({ channel: [{ channel_id: 5, channel_url: { body: "{}" } }] }, {}),
    "图片位或上传回执无效",
  );
});

test("price types, tiers, field types and text limits are validated before mutation", () => {
  assert.ok(validateWorkPatch({ price_type: "diamond" }, workEditorFields(fixture)));
  assert.ok(validateWorkPatch({ price: 10 }, workEditorFields(fixture)));
  assert.ok(validateWorkPatch({ price: 301, price_rank: 0 }, { price_type: "diamond" }));
  assert.equal(validateWorkPatch({ price: 600, price_rank: 1 }, { price_type: "diamond" }), null);
  assert.ok(validateWorkPatch({ sync_pc_flag: "true" }, {}));
  assert.ok(validateWorkPatch({ update_summary: "字".repeat(201) }, {}));
  assert.ok(validateWorkPatch({ info: `<p>${"字".repeat(1001)}</p>` }, {}));
  assert.equal(validateWorkPatch({ info: `<p>${"&amp;".repeat(1000)}</p>` }, {}), null);
});

test("runtime dictionaries preserve ids, category parents and current image versions", async () => {
  mockFetch((url) =>
    url.endsWith("/item-tag/")
      ? response({ tag_list: ["魔法"] })
      : response({
          pri_type: { pe: [{ id: 2, title: "add_ons" }], comp: [] },
          sub_type: { pe: { 2: [{ id: 4, title: "玩法" }] } },
          mod_second_type: { 4: [{ id: 7, title: "大型玩法" }] },
          mod_version: ["3.9"],
          label_type: { 1: [{ id: 23, title: "生存" }] },
          channel: {
            pe: [{ id: 5, width: 1000, height: 1000, title: "组件ICON", version: 3 }],
            pe_multi: [],
            comp: [],
          },
        }),
  );
  const result = await getWorkEditorOptions(session);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.peSubTypes["2"]?.[0]?.id, 4);
    assert.equal(result.value.peImages[0]?.version, 3);
    assert.deepEqual(result.value.tags, ["魔法"]);
  }
});

test("review is separate from saving and does not hide need_check_apply", async () => {
  const calls = mockFetch((_url, _init, index) =>
    index === 0 ? response(fixture) : response({ need_check_apply: true, queue_length: 7 }),
  );
  const result = await submitWorkReview(session, itemId);
  assert.deepEqual(result, { ok: true, value: { needCheckApply: true, queueLength: 7 } });
  assert.equal(calls[1]?.init.method, "PUT");
  assert.equal(JSON.parse(String(calls[1]?.init.body)).is_check_apply, false);
});

test("upload policy blocks off-service, credential-bearing and insecure destinations", () => {
  const token = (url: string) => `Policy signature:${btoa(JSON.stringify({ url }))}`;
  assert.equal(
    resolveWorkUploadUrl(token("https://x19.pfp.ps.netease.com/x19/file/new/")),
    "https://x19.pfp.ps.netease.com/x19/file/new/",
  );
  for (const url of [
    "https://evil.example/upload",
    "http://x19.fp.ps.netease.com/x19/file/new/",
    "https://user:password@x19.fp.ps.netease.com/x19/file/new/",
  ])
    assert.throws(() => resolveWorkUploadUrl(token(url)));
  assert.equal(parseWorkUploadReply("<textarea>{}</textarea>", null, "image", "test.png", 2), null);
});

test("upload follows the issued policy and never forwards account cookies to FP", async () => {
  const token = `Policy signature:${btoa(JSON.stringify({ url: "https://x19.pfp.ps.netease.com/x19/file/new/" }))}`;
  const calls = mockFetch((_url, _init, index) =>
    index === 0
      ? response({ token })
      : new Response('<textarea>{"url":"https://x19.pfp.ps.netease.com/package.zip"}</textarea>', {
          headers: { "x-ntes-signature": "signed-receipt" },
        }),
  );
  const result = await uploadWorkFile(
    session,
    new Blob(["test"], { type: "application/zip" }),
    "test.zip",
    "zip_package",
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0]?.url ?? "", /file_type=zip_package/);
  assert.equal(new Headers(calls[1]?.init.headers).has("Cookie"), false);
  const form = calls[1]?.init.body;
  assert.ok(form instanceof FormData);
  assert.equal(form.get("Authorization"), token);
  if (result.ok) assert.equal(result.value.receipt.sign, "signed-receipt");
});

test("empty write payloads succeed, expired sessions and HTTP errors never look successful", async () => {
  mockFetch(() => response());
  assert.equal((await writeMcDevData("test", "/test", session, "POST", "{}")).ok, true);
  assert.equal((await getMcDevData("test", "/test", session)).ok, false);
  mockFetch(() => response({}, "no_login"));
  assert.deepEqual(await readWorkEditor(session, itemId), { ok: false, error: { kind: "session_expired" } });
  mockFetch(() => new Response('{"status":"ok","data":{}}', { status: 500 }));
  assert.equal((await writeMcDevData("test", "/test", session, "POST", "{}")).ok, false);
});

test("GET follows one same-origin trailing slash normalization with the same query", async () => {
  const calls = mockFetch((_url, _init, index) =>
    index === 0
      ? new Response(null, { status: 308, headers: { location: "/items/mc_consts/?platform=pe" } })
      : response({ loaded: true }),
  );
  const result = await getMcDevData("items.mc_consts", "/items/mc_consts?platform=pe", session);
  assert.deepEqual(result, { ok: true, value: { loaded: true } });
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.url, "https://mc-launcher.webapp.163.com/items/mc_consts/?platform=pe");
  assert.equal(calls[1]?.init.redirect, "manual");
});

test("foreign hosts, changed queries and redirect loops are not mistaken for offline connections", async () => {
  for (const location of [
    "https://evil.example/item-tag/",
    "/item-tag/?changed=true",
    "/login/",
    "https://user:password@mc-launcher.webapp.163.com/item-tag/",
  ]) {
    const calls = mockFetch(() => new Response(null, { status: 308, headers: { location } }));
    const result = await getMcDevData("item-tag", "/item-tag", session);
    assert.equal(calls.length, 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "business");
  }
  const calls = mockFetch(() => new Response(null, { status: 308, headers: { location: "/item-tag/" } }));
  const result = await getMcDevData("item-tag", "/item-tag", session);
  assert.equal(calls.length, 2);
  assert.equal(result.ok, false);
});

test("POST and PUT redirects never replay a write or mark the account offline", async () => {
  for (const method of ["POST", "PUT"] as const) {
    const calls = mockFetch(() => new Response(null, { status: 308, headers: { location: "/test/" } }));
    const result = await writeMcDevData("test", "/test", session, method, "{}");
    assert.equal(calls.length, 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "business");
  }
});
