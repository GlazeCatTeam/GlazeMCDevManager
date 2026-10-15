import {
  isWorkRecord,
  isWorkSaveParams,
  isWorkValue,
  normalizePcRequirements,
  type WorkEditorDocument,
  type WorkEditorOptions,
  type WorkImageSlot,
  type WorkOption,
  type WorkRecord,
  type WorkReviewResult,
  type WorkSaveParams,
  type WorkValue,
  workSections,
} from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, parsePlatformJson, writeMcDevData } from "../http/client";
import { isNeteaseImageUrl } from "../http/hosts";
import { lobbyFields, normalizeWorkAdvanced, validateWorkAdvanced } from "./work-advanced";
import { emptyWorkUpdate, normalizeWorkUpdateDefaults } from "./work-update-defaults";
import { workUpdateFields } from "./work-update-fields";
import { readWorkStatus } from "./works";

export const diamondPrices = [300, 600, 1000, 2000, 5000, 10000, 20000];
const editableStates = new Set(["init", "online", "reject", "offline", "system_offline"]);
const booleanFields = new Set(["is_original", "sync_pc_flag", "mount_call_enabled", "weak_offline"]);
const numberFields = new Set([
  "is_domain_server_item",
  "price",
  "price_rank",
  "pri_type",
  "sub_type",
  "mod_second_type",
]);
const stringFields = new Set([
  "item_name",
  "activity_desc",
  "relate_item_id",
  "info",
  "mod_version",
  "banner_pic",
  "update_summary",
  "weak_offline_reason",
  "price_type",
]);

/** Reject unknown data instead of silently coercing platform records */
function record(value: unknown): WorkRecord {
  return isWorkRecord(value) && isWorkValue(value) ? value : {};
}
/** Read a platform list while retaining original record properties */
function records(value: unknown): WorkRecord[] {
  return Array.isArray(value) ? value.filter(isWorkRecord) : [];
}
/** Decode fields which the platform sometimes returns as JSON strings */
function structured(value: WorkValue | undefined, fallback: WorkValue): WorkValue {
  if (typeof value !== "string") return value ?? fallback;
  try {
    const parsed = parsePlatformJson(value);
    return isWorkValue(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
/** Canonical equality for optimistic concurrency, independent of property order */
function canonical(value: WorkValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isWorkRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
/** Normalize only the editable view; response fields remain available in the save adapter */
export function workEditorFields(raw: WorkRecord): WorkRecord {
  const values: WorkRecord = {};
  for (const key of Object.values(workSections).flat()) values[key] = raw[key] ?? null;
  values.tag = raw.tags ?? raw.tag ?? [];
  const dlc = record(raw.dlc_info);
  values.dlc_info = { ...dlc, master: structured(dlc.master, {}), slave_list: structured(dlc.slave_list, []) };
  values.relate_item_id = String(raw.relate_item_id ?? "");
  if (isWorkRecord(values.sync_item_info) && values.sync_item_info.requirement !== undefined)
    values.sync_item_info = {
      ...values.sync_item_info,
      requirement: normalizePcRequirements(values.sync_item_info.requirement),
    };
  return values;
}
/** Fetch the full editor from the same authoritative detail endpoint */
export async function readWorkEditor(session: NeteaseSession, itemId: string): Promise<Result<WorkEditorDocument>> {
  const response = await getMcDevData("items.pe.editor", `/items/categories/pe/${itemId}`, session);
  if (!response.ok) return response;
  const raw = record(response.value);
  if (typeof raw.item_name !== "string" || typeof raw.status !== "string")
    return fail({ kind: "parse", endpoint: "items.pe.editor" });
  return ok({
    itemId,
    status: readWorkStatus(raw.status),
    version: String(raw.item_version ?? ""),
    modCode: String(raw.normal_number ?? ""),
    fields: workEditorFields(raw),
    guides: Array.isArray(raw.guide_list) ? raw.guide_list : [],
  });
}
/** Resolve numeric choices from runtime mc_consts, never from display labels */
function options(value: unknown): WorkOption[] {
  return records(value).flatMap((row) =>
    typeof row.id === "number" && typeof row.title === "string" ? [{ id: row.id, title: row.title }] : [],
  );
}
/** Preserve the parent id for cascading selectors */
function optionGroups(value: unknown): Record<string, WorkOption[]> {
  return Object.fromEntries(Object.entries(record(value)).map(([key, rows]) => [key, options(rows)]));
}
/** Read image dimensions and version numbers from the platform */
function imageSlots(value: unknown): WorkImageSlot[] {
  return records(value).flatMap((row) =>
    typeof row.id === "number" &&
    typeof row.title === "string" &&
    typeof row.width === "number" &&
    typeof row.height === "number"
      ? [
          {
            id: row.id,
            title: row.title,
            width: row.width,
            height: row.height,
            version: typeof row.version === "number" ? row.version : 0,
          },
        ]
      : [],
  );
}
/** Load form dictionaries; failures remain visible instead of producing hardcoded choices */
export async function getWorkEditorOptions(session: NeteaseSession): Promise<Result<WorkEditorOptions>> {
  const [constants, tags, profile] = await Promise.all([
    getMcDevData("items.mc_consts", "/items/mc_consts/", session),
    getMcDevData("item-tag", "/item-tag/", session),
    getMcDevData("users.me", "/users/me", session),
  ]);
  if (!constants.ok) return constants;
  if (!tags.ok) return tags;
  if (!profile.ok) return profile;
  const c = record(constants.value);
  const channel = record(c.channel);
  const types = record(c.pri_type);
  const subtypes = record(c.sub_type);
  if (!Array.isArray(types.pe) || !Array.isArray(channel.pe))
    return fail({ kind: "parse", endpoint: "items.mc_consts" });
  const peImages = [...imageSlots(channel.pe), ...imageSlots(channel.pe_multi)];
  return ok({
    prerequisiteAllowed: record(profile.value).prerequisite_switch === true,
    lobbyTags: options(c.lobby_tags),
    lobbyTagLimit: typeof c.item_tag_limit === "number" ? c.item_tag_limit : 0,
    lobbyCompetitiveTagId: options(c.lobby_tags).find((tag) => tag.title === "竞技模式")?.id ?? null,
    tags: Array.isArray(record(tags.value).tag_list)
      ? (record(tags.value).tag_list as WorkValue[]).filter((v): v is string => typeof v === "string")
      : [],
    tagLimit: typeof c.item_tag_limit === "number" && c.item_tag_limit > 0 ? c.item_tag_limit : 0,
    peTypes: options(types.pe),
    pcTypes: options(types.comp),
    peSubTypes: optionGroups(subtypes.pe),
    peResourceFileTypes: Object.fromEntries(
      Object.entries(record(subtypes.pe)).map(([key, value]) => [
        key,
        [
          ...new Set(
            records(value)
              .map((row) => row.file_type)
              .filter((type): type is string => typeof type === "string" && !!type),
          ),
        ],
      ]),
    ),
    pcSubTypes: optionGroups(subtypes.pc ?? subtypes.comp),
    secondTypes: optionGroups(c.mod_second_type),
    recommendTags: optionGroups(c.label_type),
    versions: Array.isArray(c.mod_version) ? c.mod_version.filter((v): v is string => typeof v === "string") : [],
    peImages: peImages.filter((slot, i) => peImages.findIndex((v) => v.id === slot.id) === i),
    pcImages: imageSlots(channel.comp),
    pcTags: options(record(c.tag).comp),
    pcScopes: records(c.available_scope).flatMap((r) =>
      typeof r.id === "string" && typeof r.title === "string" ? [{ id: r.id, title: r.title }] : [],
    ),
    prices: records(c.price_type).flatMap((r) =>
      typeof r.id === "string"
        ? [
            {
              id: r.id,
              title: String(r.title ?? r.id),
              min: Number(r.min ?? 0),
              max: typeof r.max === "number" ? r.max : null,
              step: Number(r.step ?? 1),
            },
          ]
        : [],
    ),
  });
}
/** Restrict edited fields and validate limits before any write request */
export function validateWorkPatch(patch: WorkRecord, original: WorkRecord): string | null {
  const advancedError = validateWorkAdvanced(patch, original);
  if (advancedError) return advancedError;
  for (const [key, value] of Object.entries(patch)) {
    if (stringFields.has(key) && typeof value !== "string") return `${key} 应为文本`;
    if (booleanFields.has(key) && typeof value !== "boolean") return `${key} 应为布尔值`;
    if (numberFields.has(key) && (typeof value !== "number" || !Number.isInteger(value))) return `${key} 应为整数`;
    if (
      ["tag", "res", "channel", "video_info_list", "label_type_list", "prerequisite_items"].includes(key) &&
      !Array.isArray(value)
    )
      return `${key} 应为列表`;
    if (["dlc_info", "sync_item_info"].includes(key) && !isWorkRecord(value)) return `${key} 应为对象`;
  }
  if (typeof patch.item_name === "string" && !patch.item_name.trim()) return "资源名称不能为空";
  if (typeof patch.update_summary === "string" && patch.update_summary.length > 200) return "更新纪要不能超过 200 字";
  if (typeof patch.info === "string" && visibleTextLength(patch.info) > 1000) return "PE 详情不能超过 1000 字";
  if (patch.is_domain_server_item !== undefined && ![0, 1].includes(Number(patch.is_domain_server_item)))
    return "我的山头选项无效";
  if (patch.relate_item_id && !/^\d{1,32}$/.test(String(patch.relate_item_id))) return "关联作品 ID 无效";
  if (patch.price_type !== undefined && patch.price_type !== original.price_type) return "已有作品不能切换定价类型";
  const price = patch.price ?? original.price;
  const priceType = patch.price_type ?? original.price_type;
  const rank = patch.price_rank ?? original.price_rank;
  if (patch.price !== undefined || patch.price_rank !== undefined) {
    if (typeof price !== "number" || !Number.isInteger(price) || price < 0) return "价格无效";
    if (priceType === "free" && price !== 0) return "免费作品价格必须为 0";
    if (priceType === "diamond" && diamondPrices[Number(rank)] !== price) return "钻石价格与定价档位不匹配";
  }
  if (
    Array.isArray(patch.tag) &&
    patch.tag.some((t) => !isWorkRecord(t) || typeof t.name !== "string" || !t.name.trim())
  )
    return "模组标签无效";
  if (
    Array.isArray(patch.label_type_list) &&
    patch.label_type_list.some((v) => typeof v !== "number" || !Number.isInteger(v))
  )
    return "推荐标签无效";
  if (
    patch.pri_type !== undefined &&
    patch.pri_type !== original.pri_type &&
    (patch.pri_type === 9 || original.pri_type === 9)
  )
    return "前置模组不能在此切换作品类型";
  if (Array.isArray(patch.res)) {
    for (const entry of patch.res) {
      if (!isWorkRecord(entry) || typeof entry.res_name !== "string" || typeof entry.add_version !== "boolean")
        return "资源文件数据无效";
      if (isWorkRecord(entry.res_url) && !validReceipt(entry.res_url, "zip_package")) return "资源上传回执无效";
      if (!isWorkRecord(entry.res_url) && typeof entry.res_url !== "string") return "资源地址无效";
    }
  }
  if (Array.isArray(patch.channel) && !validChannels(patch.channel)) return "图片位或上传回执无效";
  if (patch.banner_pic && (typeof patch.banner_pic !== "string" || !isNeteaseImageUrl(patch.banner_pic)))
    return "推广图地址无效";
  if (
    Array.isArray(patch.video_info_list) &&
    patch.video_info_list.some(
      (v) =>
        !isWorkRecord(v) ||
        typeof v.url !== "string" ||
        !isNeteaseImageUrl(v.url) ||
        typeof v.size !== "number" ||
        v.size < 0 ||
        v.size > 50 * 1024 * 1024 ||
        typeof v.cover !== "string" ||
        (v.cover !== "" && !isNeteaseImageUrl(v.cover)),
    )
  )
    return "视频数据无效";
  if (
    isWorkRecord(patch.dlc_info) &&
    (typeof patch.dlc_info.dlc_switch !== "boolean" ||
      !["master", "slave", "off"].includes(String(patch.dlc_info.dlc_type)))
  )
    return "关联模组配置无效";
  if (isWorkRecord(patch.sync_item_info)) {
    const pc = patch.sync_item_info;
    for (const key of ["item_name", "brief", "info", "available_scope", "weak_offline_reason"])
      if (pc[key] !== undefined && typeof pc[key] !== "string") return `PC ${key} 无效`;
    for (const key of ["weak_offline", "include_map"])
      if (pc[key] !== undefined && typeof pc[key] !== "boolean") return `PC ${key} 无效`;
    for (const key of ["pri_type", "sub_type"])
      if (pc[key] !== undefined && (typeof pc[key] !== "number" || !Number.isInteger(pc[key]))) return `PC ${key} 无效`;
    if (pc.channel !== undefined && (!Array.isArray(pc.channel) || !validChannels(pc.channel)))
      return "PC 图片配置无效";
    if (
      pc.tag !== undefined &&
      (!Array.isArray(pc.tag) || pc.tag.some((v) => typeof v !== "number" || !Number.isInteger(v)))
    )
      return "PC 标签无效";
  }
  return null;
}

/** Count entities emitted by the rich editor as visible characters */
function visibleTextLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi, (_match, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()] ?? "";
      const code =
        entity[1]?.toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
    }).length;
}

/** Uploaded resources carry the signed receipt, never just a download URL */
function validReceipt(value: WorkRecord, type: string): boolean {
  if (typeof value.body !== "string" || typeof value.sign !== "string" || !value.sign || value.file_type !== type)
    return false;
  try {
    return isWorkRecord(JSON.parse(value.body));
  } catch {
    return false;
  }
}

/** Validate every edited image row and reject duplicate channel ids */
function validChannels(value: WorkValue[]): boolean {
  const ids = new Set<number>();
  return value.every((entry) => {
    if (
      !isWorkRecord(entry) ||
      typeof entry.channel_id !== "number" ||
      !Number.isInteger(entry.channel_id) ||
      ids.has(entry.channel_id)
    )
      return false;
    ids.add(entry.channel_id);
    return isWorkRecord(entry.channel_url)
      ? validReceipt(entry.channel_url, "image")
      : typeof entry.channel_url === "string" && (entry.channel_url === "" || isNeteaseImageUrl(entry.channel_url));
  });
}
/** Build the documented update DTO from the latest server snapshot plus an explicit patch */
export function buildWorkUpdate(raw: WorkRecord, patch: WorkRecord): WorkRecord {
  const result: WorkRecord = emptyWorkUpdate();
  for (const field of workUpdateFields)
    if (raw[field] !== undefined && (raw[field] !== null || !(field in result))) result[field] = raw[field];
  result.tag = raw.tags ?? raw.tag ?? [];
  result.white_list = structured(raw.whitelist ?? raw.white_list, []);
  result.mc_version = Array.isArray(raw.mc_version)
    ? raw.mc_version
    : structured(raw.mc_version, typeof raw.mc_version === "string" && raw.mc_version ? [raw.mc_version] : []);
  const dlc = record(workEditorFields(raw).dlc_info);
  result.dlc_info = {
    ...record(result.dlc_info),
    ...dlc,
    dlc_switch: dlc.dlc_switch ?? false,
    dlc_type: dlc.dlc_type || "off",
    master: dlc.master ?? {},
    slave_list: dlc.slave_list ?? [],
  };
  result.claim_item_enabled = Boolean(raw.claim_item_enabled);
  Object.assign(result, patch);
  normalizeWorkUpdateDefaults(result);
  result.is_check_apply = false;
  result.pre_review_video = raw.pre_review_video || "{}";
  result.collection_id = String(raw.collection_id || "0");
  result.relate_item_id = String(result.relate_item_id || "0");
  if (result.sync_pc_flag && isWorkRecord(result.sync_item_info)) {
    const syncKeys = [
      "weak_offline",
      "weak_offline_reason",
      "item_id",
      "item_name",
      "category",
      "include_map",
      "tag",
      "requirement",
      "brief",
      "game_host",
      "info",
      "available_scope",
      "pri_type",
      "label_type_list",
      "sub_type",
      "channel",
    ];
    result.sync_item_info = Object.fromEntries(
      Object.entries(result.sync_item_info).filter(([key]) => syncKeys.includes(key)),
    );
  }
  if (!result.sync_pc_flag) delete result.sync_item_info;
  if (
    raw.pe_is_add_play_plan === true &&
    typeof raw.play_plan_expire_time === "number" &&
    raw.play_plan_expire_time > 0 &&
    raw.play_plan_expire_time < Date.now() / 1000
  ) {
    delete result.play_plan_expire_time;
    result.play_plan_expire_month = 0;
  }
  return normalizeWorkAdvanced(result, "prerequisite_items" in patch);
}
/** Preserve numeric 64-bit relate_item_id exactly when serializing the request */
function serializeUpdate(value: WorkRecord): string {
  const rawJson = (JSON as typeof JSON & { rawJSON: (text: string) => unknown }).rawJSON;
  return JSON.stringify(value, (key, entry: unknown) =>
    key === "relate_item_id" && typeof entry === "string" && /^\d+$/.test(entry) ? rawJson(entry) : entry,
  );
}
/** Merge only edited fields; concurrent changes to those fields require reloading */
export async function saveWorkEditor(session: NeteaseSession, params: WorkSaveParams): Promise<Result<undefined>> {
  if (!isWorkSaveParams(params)) return fail({ kind: "business", code: "invalid_input", message: "保存参数无效" });
  const response = await getMcDevData("items.pe.editor", `/items/categories/pe/${params.itemId}`, session);
  if (!response.ok) return response;
  const raw = record(response.value);
  if (!editableStates.has(String(raw.status)))
    return fail({ kind: "business", code: "read_only", message: "作品当前状态不允许编辑，请刷新详情" });
  const fields = workEditorFields(raw);
  for (const key of Object.keys(params.patch)) {
    if (canonical(fields[key] ?? null) !== canonical(params.base[key] ?? null))
      return fail({ kind: "business", code: "conflict", message: "作品已在其他地方修改，请刷新后再保存" });
  }
  const error = validateWorkPatch(params.patch, fields);
  if (error) return fail({ kind: "business", code: "validation", message: error });
  const body = buildWorkUpdate(raw, params.patch);
  const dictionaryFields = [
    "res",
    "pri_type",
    "sub_type",
    "mod_second_type",
    "mod_version",
    "label_type_list",
    "price",
    "sync_item_info",
    "sync_pc_flag",
    "prerequisite_items",
    "pe_is_add_play_plan",
    "corp_proof_image",
    "discount",
    ...lobbyFields,
  ];
  if (
    dictionaryFields.some((key) => key in params.patch) ||
    (body.sync_pc_flag && records(record(body.sync_item_info).channel).length > 0)
  ) {
    const choices = await getWorkEditorOptions(session);
    if (!choices.ok) return choices;
    const c = choices.value;
    const advancedError = validateWorkAdvanced(params.patch, fields, c, params.itemId);
    if (advancedError) return fail({ kind: "business", code: "validation", message: advancedError });
    for (const [key, options] of [
      ["pri_type", c.peTypes],
      ["sub_type", c.peSubTypes[String(body.pri_type)] ?? []],
      ["mod_second_type", c.secondTypes[String(body.sub_type)] ?? []],
    ] as const) {
      if (
        key in params.patch &&
        body[key] !== 0 &&
        !(key === "pri_type" && body[key] === 9 && raw.pri_type === 9) &&
        !options.some((option) => option.id === body[key])
      )
        return fail({ kind: "business", code: "validation", message: "资源分类已变化，请刷新平台选项" });
    }
    if ("mod_version" in params.patch && !c.versions.includes(String(body.mod_version)))
      return fail({ kind: "business", code: "validation", message: "modAPI 版本不在平台选项中" });
    if ("label_type_list" in params.patch && Array.isArray(body.label_type_list)) {
      const ids = new Set(
        Object.values(c.recommendTags)
          .flat()
          .map((option) => option.id),
      );
      if (
        body.label_type_list.some((id) => typeof id !== "number" || !ids.has(id)) ||
        (c.tagLimit > 0 && body.label_type_list.length > c.tagLimit)
      )
        return fail({ kind: "business", code: "validation", message: "推荐标签无效或超过平台数量限制" });
    }
    const price = c.prices.find((p) => p.id === body.price_type);
    if (
      "price" in params.patch &&
      price &&
      typeof body.price === "number" &&
      (body.price < price.min ||
        (price.max !== null && body.price > price.max) ||
        (price.step > 0 && (body.price - price.min) % price.step !== 0))
    )
      return fail({ kind: "business", code: "validation", message: "价格不符合平台范围或步长" });
    if (body.sync_pc_flag) {
      const sync = record(body.sync_item_info);
      const channels = records(sync.channel);
      for (const image of channels) {
        const slot = choices.value.pcImages.find((s) => s.id === image.channel_id);
        if (!slot || slot.version <= 0)
          return fail({ kind: "business", code: "validation", message: "PC 图片位版本无法匹配，请刷新平台配置" });
        image.version = slot.version;
        image.channel_required = false;
      }
      body.sync_item_info = { ...sync, channel: channels };
    }
  }
  const saved = await writeMcDevData(
    "items.pe.update",
    `/items/categories/pe/${params.itemId}/update`,
    session,
    "POST",
    serializeUpdate(body),
  );
  return saved.ok ? ok(undefined) : saved;
}
/** Submit separately from saving and surface the platform's extra-review requirement */
export async function submitWorkReview(session: NeteaseSession, itemId: string): Promise<Result<WorkReviewResult>> {
  const detail = await readWorkEditor(session, itemId);
  if (!detail.ok) return detail;
  if (!editableStates.has(detail.value.status))
    return fail({ kind: "business", code: "read_only", message: "作品当前状态不能提交审核" });
  const result = await writeMcDevData(
    "items.pe.apply_review",
    `/items/categories/pe/${itemId}/apply_review`,
    session,
    "PUT",
    JSON.stringify({ apply_review_text: "", conflict_notify: 0, is_check_apply: false }),
  );
  if (!result.ok) return result;
  if (
    !isWorkRecord(result.value) ||
    (result.value.need_check_apply !== undefined && typeof result.value.need_check_apply !== "boolean")
  )
    return fail({ kind: "parse", endpoint: "items.pe.apply_review" });
  return ok({
    needCheckApply: result.value.need_check_apply === true,
    queueLength: Number(result.value.queue_length ?? 0),
  });
}
