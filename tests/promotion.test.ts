import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  isBannerSave,
  isPromotionJoin,
  isPromotionModule,
  isPromotionPage,
} from "../packages/contracts/src/rpc/promotion";
import {
  cancelPromotionDiscount,
  getPromotionActivities,
  getPromotionApplications,
  getPromotionDates,
  getPromotionDiscount,
  getPromotionModule,
  joinPromotion,
  readPromotionDates,
  savePromotionBanner,
} from "../packages/netease/src/endpoints/promotion";

const originalFetch = globalThis.fetch;
const session = { sessionCookie: "promotion-test-only" };
const now = Math.floor(Date.now() / 1000);
const activity = {
  activity_id: "a1",
  activity_name: "测试活动",
  activity_description: "规则",
  activity_instruction: "说明",
  begin_at: now - 100,
  apply_end_at: now + 10000,
  end_at: now + 20000,
  activity_modules: [{ module_id: 1, module_name: "创作赛道", min_discount: 30, max_discount: 80 }],
  activity_partition: [],
};
const candidate = { item_id: "9007199254740993", item_name: "候选作品", price: 100, price_type: "diamond" };
const join = {
  account: "a",
  activityId: "a1",
  moduleId: "1",
  kind: "discount" as const,
  itemIds: [candidate.item_id],
  intro: "报名",
  discount: 60,
  partitionId: "",
  images: [],
  videos: [],
};
const banner = {
  account: "a",
  itemId: candidate.item_id,
  startTime: now + 86400,
  imageUrl: "https://x19.fp.ps.netease.com/banner.png",
  extra: "说明",
  activity: "活动",
  feature: "特色",
  update: "更新",
};

/** Produce platform envelopes without reaching the live service */
function reply(data: unknown, status = "ok") {
  return new Response(JSON.stringify({ status, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("rejects malformed boundaries and preserves valid long IDs", () => {
  assert.ok(isPromotionJoin(join));
  assert.ok(isBannerSave(banner));
  for (const page of [-1, 0.2, 100001, "0"]) assert.equal(isPromotionPage({ page }), false);
  assert.equal(isPromotionModule({ ...join, moduleId: "../escape" }), false);
  assert.equal(isPromotionJoin({ ...join, itemIds: ["1", "1"] }), false);
  assert.equal(isPromotionJoin({ ...join, kind: "review", itemIds: ["1", "2"] }), false);
  assert.equal(isPromotionJoin({ ...join, images: [{ url: banner.imageUrl }] }), false);
  assert.equal(isBannerSave({ ...banner, startTime: NaN }), false);
});

test("review enrollment requires an introduction and at most three images and one video", () => {
  const image = { body: "signed-image", sign: "signature", file_type: "image" };
  const video = { body: "signed-video", sign: "signature", file_type: "video" };
  const review = {
    ...join,
    kind: "review",
    intro: "<p><b>作品特色</b></p>",
    images: [image, image, image],
    videos: [video],
  };
  assert.ok(isPromotionJoin(review));
  for (const intro of [
    "",
    "  ",
    "<p><br></p>",
    "<p>&nbsp; &#160; &#xA0;</p>",
    "<div>\u200b</div>",
    "<script>alert(1)</script>",
  ])
    assert.equal(isPromotionJoin({ ...review, intro }), false);
  assert.equal(isPromotionJoin({ ...review, images: [image, image, image, image] }), false);
  assert.equal(isPromotionJoin({ ...review, videos: [video, video] }), false);
  assert.ok(isPromotionJoin({ ...review, images: [], videos: [] }));
  assert.ok(isPromotionJoin({ ...join, intro: "" }));
});

test("pagination sends offsets and exact PE application filters", async () => {
  const paths: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    paths.push(url);
    return url.pathname.includes("user-applications")
      ? reply({ applications: [], count: 0 })
      : reply({ data: [activity], count: 25 });
  };
  const result = await getPromotionActivities(session, { page: 2 });
  assert.ok(result.ok);
  assert.equal(result.value.records[0]?.modules[0]?.id, "1");
  assert.equal(paths[0]?.searchParams.get("start"), "20");
  await getPromotionApplications(session, { page: 0 });
  assert.equal(paths[1]?.searchParams.get("platform"), "pe");
  assert.equal(paths[1]?.searchParams.get("type"), "apply");
});

test("missing, partial and expired responses stay errors instead of empty records", async () => {
  globalThis.fetch = async () => reply({});
  assert.equal((await getPromotionActivities(session, { page: 0 })).ok, false);
  assert.deepEqual(await getPromotionDiscount(session), { ok: true, value: { activity: null } });
  globalThis.fetch = async (input) => reply(String(input).includes("/items") ? {} : { items: [candidate] });
  assert.equal((await getPromotionModule(session, join)).ok, false);
  globalThis.fetch = async () => reply(null, "not_login");
  assert.equal((await getPromotionDates(session)).ok, false);
  assert.throws(() => readPromotionDates({ permit: { "123": "true" } }));
});

test("recognizes the live zero-filled no-discount shell without hiding damaged campaigns", async () => {
  const empty = {
    activity_id: "",
    activity_name: "",
    activity_description: "",
    activity_instruction: "",
    activity_type: 0,
    begin_at: 0,
    apply_end_at: 0,
    end_at: 0,
    status: "",
    switch: "open",
  };
  globalThis.fetch = async () => reply(empty);
  assert.deepEqual(await getPromotionDiscount(session), { ok: true, value: { activity: null } });
  for (const patch of [
    { activity_name: "有名称但缺少 ID 的活动" },
    { begin_at: now },
    { activity_id: "a1" },
    { activity_modules: [{ module_id: 1 }] },
  ]) {
    globalThis.fetch = async () => reply({ ...empty, ...patch });
    const result = await getPromotionDiscount(session);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "parse");
  }
});

test("ended activity queries preserve the platform reason instead of reporting empty lists", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: "fail", msg: "活动已结束", data: null }), { status: 200 });
  const result = await getPromotionModule(session, { kind: "review", activityId: "a1", moduleId: "1" });
  assert.equal(result.ok, false);
  if (!result.ok)
    assert.deepEqual(result.error, { kind: "business", code: "fail", message: "活动已结束", httpStatus: 200 });
});

test("eligibility dates retain server seconds, rejection reasons and recent flags", () => {
  const data = readPromotionDates({
    permit: { "1792339200": false, "1791734400": true },
    reason: { "1792339200": "资格不足" },
    recent_records: { "1791734400": true },
  });
  assert.deepEqual(data.dates, [
    { time: 1791734400, allowed: true, reason: "", recent: true },
    { time: 1792339200, allowed: false, reason: "资格不足", recent: false },
  ]);
});

test("discount registration rechecks membership and range, with a single exact POST", async () => {
  const writes: { url: string; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") {
      writes.push({ url: String(input), body: JSON.parse(String(init.body)) });
      return reply(null);
    }
    return reply(
      String(input).includes("/candidates")
        ? { items: [candidate] }
        : String(input).includes("/items")
          ? { items: [] }
          : activity,
    );
  };
  assert.equal((await joinPromotion(session, { ...join, discount: 90 })).ok, false);
  assert.equal(writes.length, 0);
  assert.equal((await joinPromotion(session, { ...join, itemIds: ["not-a-candidate"] })).ok, false);
  assert.equal(writes.length, 0);
  assert.equal((await joinPromotion(session, join)).ok, true);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0]?.body, {
    activity_id: "a1",
    module_id: "1",
    item_id_list: [candidate.item_id],
    discount: 60,
    partition_id: "",
    intro: "报名",
  });
});

test("review registrations send signed materials and protect against duplicate enrollment", async () => {
  let body: unknown;
  let registered = false;
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") {
      body = JSON.parse(String(init.body));
      return reply(null);
    }
    return reply({ items: String(input).includes("/candidates") || registered ? [candidate] : [] });
  };
  const receipt = { body: "signed-response", sign: "signature", file_type: "image" };
  assert.equal(
    (await joinPromotion(session, { ...join, kind: "review", intro: "<p><b>报名</b></p>", images: [receipt] })).ok,
    true,
  );
  assert.deepEqual(body, {
    item_id: candidate.item_id,
    apply_intro: "<p><b>报名</b></p>",
    image_list: [receipt],
    video_info_list: [],
  });
  registered = true;
  assert.equal((await joinPromotion(session, { ...join, kind: "review" })).ok, false);
});

test("banner requests use Unix seconds, fixed PE fields and trailing slash without retries", async () => {
  const writes: { method: string | undefined; url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (input, init) => {
    if (init?.method !== "GET") {
      writes.push({ method: init?.method, url: String(input), body: JSON.parse(String(init?.body)) });
      return reply(null);
    }
    return reply({ permit: { [banner.startTime]: true }, reason: {}, recent_records: {} });
  };
  assert.equal((await savePromotionBanner(session, banner)).ok, true);
  assert.ok(writes[0]?.url.endsWith("/promotion-banner/apply/"));
  assert.equal(writes[0]?.body.start_time_zone, -8);
  assert.equal(writes[0]?.body.start_time, banner.startTime);
  assert.equal(writes[0]?.body.position_id, "6");
  assert.equal(writes[0]?.body.item_category, "pe");
  assert.equal(
    (await savePromotionBanner(session, { ...banner, imageUrl: "https://example.com/not-allowed.png" })).ok,
    false,
  );
  assert.equal(writes.length, 1);
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    throw new Error("offline");
  };
  assert.equal((await savePromotionBanner(session, { ...banner, applicationId: "app1" })).ok, false);
  assert.equal(attempts, 1);
});

test("cancel refuses a campaign that has been replaced", async () => {
  let writes = 0;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "POST") writes++;
    return reply({ ...activity, activity_id: "new" });
  };
  assert.equal((await cancelPromotionDiscount(session, { activityId: "old", itemId: candidate.item_id })).ok, false);
  assert.equal(writes, 0);
});
