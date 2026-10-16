import {
  emptyWorkCreateFields,
  isWorkCreateParams,
  isWorkRecord,
  type WorkCreateParams,
  type WorkEditorOptions,
  type WorkRecord,
} from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { type NeteaseSession, writeMcDevData } from "../http/client";
import { normalizeWorkAdvanced, validateWorkAdvanced } from "./work-advanced";
import { workCreateDefaults } from "./work-create-defaults";
import { getWorkEditorOptions, validateWorkPatch } from "./work-editor";

/** Validate a new PE work against live platform dictionaries and signed upload receipts */
export function validateWorkCreate(fields: WorkRecord, options: WorkEditorOptions): string | null {
  const invalid = validateWorkPatch(fields, fields);
  if (invalid) return invalid;
  const advanced = validateWorkAdvanced(fields, fields, options);
  if (advanced) return advanced;
  if (typeof fields.item_name !== "string" || !fields.item_name.trim()) return "请填写资源名称";
  if (
    (fields.pri_type === 9
      ? !options.prerequisiteAllowed
      : !options.peTypes.some((option) => option.id === fields.pri_type)) ||
    fields.pri_type === 0
  )
    return "请选择有效的资源类别";
  for (const [key, choices] of [
    ["sub_type", options.peSubTypes[String(fields.pri_type)] ?? []],
    ["mod_second_type", options.secondTypes[String(fields.sub_type)] ?? []],
  ] as const) {
    if (choices.length && !choices.some((option) => option.id === fields[key])) return "请完整选择资源分类";
    if (!choices.length && fields[key] !== 0) return "资源分类已变化，请刷新平台选项";
  }
  if (!options.versions.includes(String(fields.mod_version))) return "请选择平台支持的 modAPI 版本";
  const tags = fields.label_type_list;
  const validTags = new Set(
    Object.values(options.recommendTags)
      .flat()
      .map((tag) => tag.id),
  );
  if (
    !Array.isArray(tags) ||
    tags.some((tag) => typeof tag !== "number" || !validTags.has(tag)) ||
    (options.tagLimit > 0 && tags.length > options.tagLimit)
  )
    return "推荐标签无效或超过平台数量限制";
  const price = options.prices.find((option) => option.id === fields.price_type);
  if (
    !price ||
    !["free", "diamond", "point"].includes(price.id) ||
    typeof fields.price !== "number" ||
    fields.price < price.min ||
    (price.max !== null && fields.price > price.max) ||
    (price.step > 0 && (fields.price - price.min) % price.step !== 0)
  )
    return "请选择有效的定价类型和价格";
  if (
    (fields.price_type === "free" && fields.price_rank !== -4) ||
    (fields.price_type === "point" && fields.price_rank !== -5)
  )
    return "定价档位无效";
  if (!Array.isArray(fields.res) || !fields.res.length) return "请上传资源文件";
  if (fields.res.some((row) => !isWorkRecord(row) || !isWorkRecord(row.res_url))) return "新作品必须使用资源上传回执";
  if (
    !Array.isArray(fields.channel) ||
    fields.channel.some(
      (row) =>
        !isWorkRecord(row) ||
        !isWorkRecord(row.channel_url) ||
        !options.peImages.some((slot) => slot.id === row.channel_id),
    )
  )
    return "新作品图片必须使用有效图片位和上传回执";
  return null;
}

/** Construct only the documented create DTO, without identifiers or update-only metadata */
export function buildWorkCreate(fields: WorkRecord): WorkRecord {
  fields = normalizeWorkAdvanced(fields);
  const body: WorkRecord = {
    ...structuredClone(workCreateDefaults),
    ...Object.fromEntries(Object.entries(fields).filter(([key]) => Object.hasOwn(workCreateDefaults, key))),
    item_name: String(fields.item_name).trim(),
    item_version: "0.1",
    is_check_apply: false,
    sync_pc_flag: false,
    dlc_info: { dlc_switch: false, dlc_type: "off", master: {}, slave_list: [] },
  };
  body.res = (Array.isArray(fields.res) ? fields.res : []).filter(isWorkRecord).map((row) => ({
    res_name: row.res_name ?? "",
    res_url: row.res_url ?? null,
    add_version: row.add_version ?? true,
    mc_version: [],
  }));
  body.channel = (Array.isArray(fields.channel) ? fields.channel : []).filter(isWorkRecord).map((row) => ({
    channel_id: row.channel_id ?? 0,
    channel_url: row.channel_url ?? null,
  }));
  return body;
}

/** Create once; the upstream endpoint succeeds without returning a work id */
export async function createWork(
  session: NeteaseSession,
  params: WorkCreateParams,
  beforeWrite?: () => void,
): Promise<Result<undefined>> {
  if (!isWorkCreateParams(params)) return fail({ kind: "business", code: "validation", message: "新建作品参数无效" });
  const fields = { ...emptyWorkCreateFields(), ...params.fields };
  const choices = await getWorkEditorOptions(session);
  if (!choices.ok) return choices;
  const invalid = validateWorkCreate(fields, choices.value);
  if (invalid) return fail({ kind: "business", code: "validation", message: invalid });
  beforeWrite?.();
  const result = await writeMcDevData(
    "items.pe.create",
    "/items/categories/pe/upload",
    session,
    "POST",
    JSON.stringify(buildWorkCreate(fields)),
  );
  return result.ok ? ok(undefined) : result;
}
