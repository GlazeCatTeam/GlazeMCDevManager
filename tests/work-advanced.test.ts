import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { deferredWorkCreatePatch, emptyWorkCreateFields, type WorkEditorOptions } from "../packages/contracts/src";
import { validWorkCrop } from "../packages/contracts/src/rpc/work-assets";
import {
  matchPcClassification,
  normalizePcRequirements,
  workResourceAllowed,
} from "../packages/contracts/src/rpc/work-resource";
import { validateWorkAdvanced } from "../packages/netease/src/endpoints/work-advanced";
import { buildWorkCreate, validateWorkCreate } from "../packages/netease/src/endpoints/work-create";
import {
  buildWorkUpdate,
  getWorkEditorOptions,
  saveWorkEditor,
  workEditorFields,
} from "../packages/netease/src/endpoints/work-editor";
import { searchWorkReferences } from "../packages/netease/src/endpoints/work-references";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const session = { sessionCookie: "unit-test-only" };
const choices: WorkEditorOptions = {
  prerequisiteAllowed: true,
  tags: [],
  tagLimit: 3,
  peTypes: [
    { id: 2, title: "玩法" },
    { id: 6, title: "大厅" },
  ],
  peSubTypes: {},
  secondTypes: {},
  recommendTags: {},
  versions: ["3.9"],
  peImages: [],
  pcImages: [],
  pcTypes: [{ id: 6, title: "玩法" }],
  pcSubTypes: { 6: [{ id: 1, title: "生存" }] },
  pcTags: [{ id: 1, title: "生存" }],
  pcScopes: [{ id: "all", title: "全部" }],
  prices: [{ id: "free", title: "免费", min: 0, max: 0, step: 0 }],
  lobbyTags: [
    { id: 1, title: "生存" },
    { id: 2, title: "竞技模式" },
  ],
  lobbyTagLimit: 2,
  lobbyCompetitiveTagId: 2,
};
const fields = () => ({
  ...emptyWorkCreateFields(),
  item_name: "测试",
  pri_type: 2,
  mod_version: "3.9",
  res: [{ res_name: "test.zip", add_version: true, res_url: { body: "{}", sign: "test", file_type: "zip_package" } }],
});
const response = (data: unknown) => new Response(JSON.stringify({ status: "ok", data }));

test("PC prerequisites round-trip platform keys and migrate old drafts without rounding ids", () => {
  const requirement = [{ item_id: "9000000000000000001", item_name: "前置", extra: "preserved" }];
  const original = { ...fields(), sync_pc_flag: true, sync_item_info: { requirement, info: "original" } };
  assert.deepEqual(workEditorFields(original).sync_item_info, original.sync_item_info);
  assert.equal(validateWorkAdvanced({ sync_item_info: original.sync_item_info }, original), null);
  const legacy = [{ id: "9000000000000000001", name: "前置", extra: "preserved" }];
  assert.deepEqual(normalizePcRequirements(legacy), requirement);
  assert.deepEqual(
    buildWorkUpdate(original, { sync_item_info: { requirement: legacy, info: "edited" } }).sync_item_info,
    { requirement, info: "edited" },
  );
  assert.deepEqual(buildWorkUpdate(original, { sync_item_info: { requirement: [] } }).sync_item_info, {
    requirement: [],
  });
  assert.match(
    validateWorkAdvanced({ sync_item_info: { requirement: [...requirement, ...legacy] } }, original) ?? "",
    /重复/,
  );
  assert.match(
    validateWorkAdvanced({ sync_item_info: { requirement: [{ item_id: "", item_name: "x" }] } }, original) ?? "",
    /前置/,
  );
});

test("resource extensions honor platform groups in both create and partial save validation", () => {
  const config = { ...choices, peResourceFileTypes: { 2: ["zip"], 4: ["png"] } };
  for (const extension of ["zip", "mcworld", "MCPACK", "mcaddon"]) {
    assert.equal(workResourceAllowed(`资源.${extension}`, 2, config), true);
    assert.equal(workResourceAllowed(`资源.${extension}`, 4, config), false);
  }
  assert.equal(workResourceAllowed("skin.png", 4, config), true);
  assert.equal(workResourceAllowed("skin.png", 2, config), false);
  assert.equal(workResourceAllowed("x.exe", 9, config), false);
  assert.equal(workResourceAllowed("x.mcaddon", 9, config), true);
  const invalid = { ...fields(), res: [{ ...fields().res[0], res_name: "wrong.png" }] };
  assert.match(validateWorkCreate(invalid, config) ?? "", /格式/);
  assert.match(validateWorkAdvanced({ pri_type: 4 }, fields(), config) ?? "", /格式/);
});

test("PC classification matches runtime titles, keeps explicit choices and leaves ambiguous mappings empty", () => {
  const config = {
    ...choices,
    peTypes: [{ id: 2, title: "add_ons" }],
    peSubTypes: { 2: [{ id: 50, title: "玩法" }] },
    pcTypes: [
      { id: 1, title: "地图组件" },
      { id: 18, title: "功能组件" },
    ],
    pcSubTypes: { 18: [{ id: 61, title: "玩法" }] },
  };
  const pe = { pri_type: 2, sub_type: 50 };
  assert.deepEqual(matchPcClassification(pe, { info: "keep" }, config), { info: "keep", pri_type: 18, sub_type: 61 });
  assert.equal(matchPcClassification(pe, { pri_type: 1 }, config).pri_type, 1);
  assert.equal(
    matchPcClassification(pe, {}, { ...config, pcTypes: [...config.pcTypes, { id: 19, title: "功能模组" }] }).pri_type,
    0,
  );
  assert.equal(matchPcClassification({ pri_type: 99 }, {}, config).pri_type, 0);
});

test("prerequisite creation requires the live account flag and enforces free standalone metadata", () => {
  const draft = { ...fields(), pri_type: 9 };
  assert.equal(validateWorkCreate(draft, choices), null);
  assert.match(validateWorkCreate(draft, { ...choices, prerequisiteAllowed: false }) ?? "", /类别/);
  assert.match(validateWorkCreate({ ...draft, sync_pc_flag: true }, choices) ?? "", /前置/);
  const body = buildWorkCreate(draft);
  assert.equal(body.price, 0);
  assert.equal(body.price_rank, -4);
  assert.deepEqual(body.prerequisite_item_ids, []);
  assert.deepEqual(body.channel, []);
});

test("authorization, dependency references and PC configuration reject invalid edits", () => {
  assert.match(validateWorkAdvanced({ is_original: false }, fields()) ?? "", /授权/);
  assert.match(validateWorkAdvanced({ corp_proof_image: "file:///secret" }, fields()) ?? "", /授权/);
  assert.equal(
    validateWorkAdvanced({ is_original: false, corp_proof_image: "https://x19.fp.ps.netease.com/proof.png" }, fields()),
    null,
  );
  assert.match(
    validateWorkAdvanced({ prerequisite_items: [{ item_id: "42", item_name: "self" }] }, fields(), undefined, "42") ??
      "",
    /自身/,
  );
  assert.match(
    validateWorkAdvanced(
      {
        sync_item_info: {
          requirement: [
            { id: "1", name: "a" },
            { id: "1", name: "b" },
          ],
        },
      },
      fields(),
    ) ?? "",
    /重复/,
  );
  assert.match(
    validateWorkAdvanced(
      { sync_pc_flag: true, sync_item_info: { pri_type: 99, available_scope: "all" } },
      fields(),
      choices,
    ) ?? "",
    /PC/,
  );
});

test("discount deletion is explicit and activity discounts cannot be modified or removed", () => {
  const discount = {
    begin_at: 1800000000,
    end_at: 1800086400,
    discount: 90,
    vip_discount: 90,
    is_activity_discount: 0,
  };
  const original = { ...fields(), price_type: "diamond", price: 600, price_rank: 1, discount: [discount] };
  assert.equal(validateWorkAdvanced({ discount: [] }, original), null);
  assert.deepEqual(buildWorkUpdate(original, { discount: [] }).discount, []);
  assert.match(validateWorkAdvanced({ discount: [{ ...discount, end_at: 1 }] }, original) ?? "", /结束/);
  assert.match(validateWorkAdvanced({ discount: [{ ...discount, discount: 0 }] }, original) ?? "", /比例/);
  assert.match(validateWorkAdvanced({ price: 300, price_rank: 0 }, original) ?? "", /折扣/);
  const activity = { ...discount, is_activity_discount: 1, discount: 100 };
  assert.match(validateWorkAdvanced({ discount: [] }, { ...original, discount: [activity] }) ?? "", /活动/);
  assert.equal(validateWorkAdvanced({ discount: [activity, discount] }, { ...original, discount: [activity] }), null);
});

test("lobby validation enforces capacity, tag exclusivity, camps and escape time", () => {
  const lobby = {
    ...fields(),
    pri_type: 6,
    lobby_tags: [1],
    lobby_min_num: 2,
    lobby_max_num: 8,
    lobby_force_max_num: 10,
  };
  assert.equal(validateWorkAdvanced(lobby, lobby, choices), null);
  for (const patch of [
    { lobby_force_max_num: 11 },
    { lobby_min_num: 9 },
    { lobby_tags: [99] },
    { lobby_tags: [1, 2], is_lobby_competitive: true },
    { lobby_tags: [2], is_lobby_competitive: true, lobby_reconnect_time: 0 },
    { lobby_tags: [2], is_lobby_competitive: true, is_asymmetric: true, lobby_camps: ["a", ""] },
  ])
    assert.ok(validateWorkAdvanced(patch, lobby, choices));
  assert.equal(
    validateWorkAdvanced(
      { lobby_tags: [2], is_lobby_competitive: true, is_asymmetric: true, lobby_camps: ["猎人", "逃生者"] },
      lobby,
      choices,
    ),
    null,
  );
});

test("creation retains unsupported detail configuration for a targeted second step", () => {
  const draft = {
    ...fields(),
    sync_pc_flag: true,
    sync_item_info: {
      pri_type: 6,
      sub_type: 1,
      available_scope: "all",
      requirement: [{ id: "9000000000000000001", name: "PC依赖" }],
    },
    dlc_info: { dlc_switch: true, dlc_type: "slave" },
    relate_item_id: "8000000000000000001",
    corp_proof_image: "https://x19.fp.ps.netease.com/proof.png",
    discount: [{ begin_at: 1, end_at: 2, discount: 90 }],
  };
  const pending = deferredWorkCreatePatch(draft);
  assert.equal(pending.relate_item_id, draft.relate_item_id);
  assert.deepEqual(pending.sync_item_info, draft.sync_item_info);
  const create = buildWorkCreate(draft);
  assert.equal(create.sync_pc_flag, false);
  assert.equal(create.sync_item_info, undefined);
  assert.equal(create.corp_proof_image, undefined);
  assert.equal(create.discount, undefined);
  assert.equal(create.relate_item_id, undefined);
});

test("reference searches use the correct pool, bounded query and exact long identifiers", async () => {
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    urls.push(String(input));
    return new Response('{"status":"ok","data":{"item":[{"item_id":9000000000000000001,"item_name":"测试"}]}}');
  };
  for (const kind of ["pePrerequisite", "pcPrerequisite", "related"] as const) {
    const result = await searchWorkReferences(session, { account: "a", kind, query: "测试 & 模组" });
    assert.deepEqual(result, { ok: true, value: [{ itemId: "9000000000000000001", name: "测试" }] });
  }
  const [pe, pc, related] = urls.map((url) => new URL(url));
  assert.equal(pe.searchParams.get("pri_type"), "9");
  assert.equal(pe.searchParams.get("span"), "20");
  assert.equal(pc.pathname, "/items/categories/comp/requirements");
  assert.equal(pc.searchParams.get("query_str"), "测试 & 模组");
  assert.equal(related.searchParams.get("mc_status"), "1");
  assert.equal((await searchWorkReferences(session, { account: "a", kind: "related", query: " " })).ok, false);
  assert.equal(urls.length, 3);
});

test("advanced partial save preserves unedited data and pairs PE prerequisite ids", async () => {
  assert.deepEqual(
    buildWorkUpdate({ ...fields(), prerequisite_item_ids: ["99"], prerequisite_items: [] }, { item_name: "重命名" })
      .prerequisite_item_ids,
    ["99"],
  );
  const original = {
    ...fields(),
    status: "init",
    item_id: "12",
    guide_list: [{ title: "保留攻略" }],
    discount: [{ existing: true }],
    pe_is_add_play_plan: false,
  };
  const patch = {
    prerequisite_items: [{ item_id: "9000000000000000001", item_name: "前置" }],
    pe_is_add_play_plan: true,
  };
  let sent = "";
  globalThis.fetch = async (input, init) => {
    if (init?.method === "POST") {
      sent = String(init.body);
      return response({});
    }
    const url = String(input);
    if (url.endsWith("/users/me")) return response({ prerequisite_switch: true });
    if (url.endsWith("/item-tag/")) return response({ tag_list: [] });
    if (url.endsWith("/items/mc_consts/")) return response({ pri_type: { pe: [] }, channel: { pe: [] } });
    return response(original);
  };
  assert.equal(
    (
      await saveWorkEditor(session, {
        account: "a",
        itemId: "12",
        patch,
        base: Object.fromEntries(Object.keys(patch).map((key) => [key, workEditorFields(original)[key]])),
      })
    ).ok,
    true,
  );
  const body = JSON.parse(sent);
  assert.deepEqual(body.prerequisite_item_ids, ["9000000000000000001"]);
  assert.deepEqual(body.guide_list, original.guide_list);
  assert.deepEqual(body.discount, original.discount);
  assert.equal(body.pe_is_add_play_plan, true);
  const options = await getWorkEditorOptions(session);
  assert.ok(options.ok && options.value.prerequisiteAllowed);
});

test("crop validation rejects outside, fractional and mismatched rectangles", () => {
  assert.equal(validWorkCrop({ x: 50, y: 0, width: 100, height: 100 }, 200, 100, 1000, 1000), true);
  for (const crop of [
    { x: -1, y: 0, width: 100, height: 100 },
    { x: 150, y: 0, width: 100, height: 100 },
    { x: 0, y: 0, width: 100, height: 0 },
    { x: 0, y: 0, width: 1.5, height: 1 },
    { x: 0, y: 0, width: 100, height: 60 },
  ])
    assert.equal(validWorkCrop(crop, 200, 100, 1000, 1000), false);
});
