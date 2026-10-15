import {
  isWorkRecord,
  normalizePcRequirements,
  type WorkEditorOptions,
  type WorkRecord,
  type WorkValue,
  workResourceAllowed,
} from "@glaze/contracts";
import { isNeteaseImageUrl } from "../http/hosts";

export const lobbyFields = [
  "lobby_min_num",
  "lobby_max_num",
  "lobby_force_max_num",
  "lobby_tags",
  "is_lobby_competitive",
  "is_asymmetric",
  "lobby_camps",
  "lobby_player_num",
  "lobby_normal_mode",
  "lobby_reconnect_time",
];

/** Validate explicit dependency rows and prohibit self references and duplicates */
function references(
  value: WorkValue | undefined,
  max: number,
  idKey: string,
  nameKey: string,
  itemId?: string,
): boolean {
  if (!Array.isArray(value) || value.length > max) return false;
  const ids = new Set<string>();
  return value.every((row) => {
    if (
      !isWorkRecord(row) ||
      typeof row[idKey] !== "string" ||
      !/^\d{1,32}$/.test(row[idKey]) ||
      typeof row[nameKey] !== "string" ||
      !row[nameKey].trim() ||
      row[idKey] === itemId ||
      ids.has(row[idKey])
    )
      return false;
    ids.add(row[idKey]);
    return true;
  });
}

/** Validate only edited advanced groups while preserving unrelated legacy platform metadata */
export function validateWorkAdvanced(
  patch: WorkRecord,
  original: WorkRecord,
  options?: WorkEditorOptions,
  itemId?: string,
): string | null {
  const v = { ...original, ...patch };
  if (
    "corp_proof_image" in patch &&
    (typeof v.corp_proof_image !== "string" || (v.corp_proof_image !== "" && !isNeteaseImageUrl(v.corp_proof_image)))
  )
    return "授权证明图片地址无效";
  if (("is_original" in patch || "corp_proof_image" in patch) && v.is_original === false && !v.corp_proof_image)
    return "非原创作品请上传授权证明";
  if ("prerequisite_items" in patch && !references(v.prerequisite_items, 1, "item_id", "item_name", itemId))
    return "PE 前置模组只能选择一个有效模组，且不能依赖自身";
  if (
    isWorkRecord(patch.sync_item_info) &&
    "requirement" in patch.sync_item_info &&
    !references(normalizePcRequirements(patch.sync_item_info.requirement ?? null), 100, "item_id", "item_name")
  )
    return "PC 前置模组无效或重复";
  if (options && ("res" in patch || "pri_type" in patch) && Array.isArray(v.res)) {
    for (const row of v.res) {
      if (
        !isWorkRecord(row) ||
        typeof row.res_name !== "string" ||
        !workResourceAllowed(row.res_name, Number(v.pri_type), options)
      )
        return "资源文件格式与所选类别不匹配";
    }
  }
  if ("pe_is_add_play_plan" in patch && typeof v.pe_is_add_play_plan !== "boolean") return "畅玩计划选项无效";
  if (
    ("dlc_info" in patch || "relate_item_id" in patch) &&
    isWorkRecord(v.dlc_info) &&
    v.dlc_info.dlc_switch === true &&
    (!v.relate_item_id || v.relate_item_id === "0" || v.relate_item_id === itemId)
  )
    return "请选择有效的关联模组，不能关联自身";
  if ("discount" in patch) {
    if (!Array.isArray(v.discount)) return "折扣配置应为列表";
    const activity = Array.isArray(original.discount)
      ? original.discount.filter((row) => isWorkRecord(row) && row.is_activity_discount === 1)
      : [];
    if (
      activity.some((row) => !(v.discount as WorkValue[]).some((next) => JSON.stringify(next) === JSON.stringify(row)))
    )
      return "不能在作品详情中删除或修改活动折扣";
    if (v.discount.length && (v.price_type !== "diamond" || Number(v.price_rank) < 1))
      return "折扣仅支持钻石二档及以上作品";
    for (const d of v.discount) {
      if (isWorkRecord(d) && d.is_activity_discount === 1) {
        if (!activity.some((row) => JSON.stringify(row) === JSON.stringify(d))) return "活动折扣只能由平台活动配置";
        continue;
      }
      if (
        !isWorkRecord(d) ||
        !Number.isInteger(d.discount) ||
        Number(d.discount) < 1 ||
        Number(d.discount) > 99 ||
        !Number.isSafeInteger(d.begin_at) ||
        !Number.isSafeInteger(d.end_at) ||
        Number(d.begin_at) <= 0 ||
        Number(d.end_at) < Number(d.begin_at)
      )
        return "折扣比例须为 1–99%，结束日期不能早于开始日期";
    }
  }
  if (
    ("price" in patch || "price_rank" in patch) &&
    Array.isArray(v.discount) &&
    v.discount.length &&
    (v.price_type !== "diamond" || Number(v.price_rank) < 1)
  )
    return "请先移除不适用于新价格的折扣";
  if (v.pri_type === 9) {
    if (
      v.price_type !== "free" ||
      v.price !== 0 ||
      v.sync_pc_flag === true ||
      (isWorkRecord(v.dlc_info) && v.dlc_info.dlc_switch === true) ||
      v.pe_is_add_play_plan === true ||
      (Array.isArray(v.prerequisite_items) && v.prerequisite_items.length)
    )
      return "前置模组必须免费，不能设置依赖、PC 同步或畅玩计划";
  }
  if (v.pri_type === 6 && ("pri_type" in patch || lobbyFields.some((key) => key in patch))) {
    for (const key of [
      "lobby_min_num",
      "lobby_max_num",
      "lobby_force_max_num",
      "lobby_player_num",
      "lobby_reconnect_time",
    ])
      if (!Number.isInteger(v[key])) return "联机大厅人数和时间须为整数";
    for (const key of ["is_lobby_competitive", "is_asymmetric", "lobby_normal_mode"])
      if (typeof v[key] !== "boolean") return "联机大厅选项无效";
    const max = Number(v.lobby_force_max_num),
      lo = Number(v.lobby_min_num),
      hi = Number(v.lobby_max_num);
    if (max < 2 || max > 10 || !((lo === 0 && hi === 0) || (lo >= 2 && lo <= hi && hi <= max)))
      return "房间限制为 2–10 人；建议人数须同时为 0，或满足 2 ≤ 最小 ≤ 最大 ≤ 房间限制";
    if (
      !Array.isArray(v.lobby_tags) ||
      !v.lobby_tags.length ||
      v.lobby_tags.some((id) => !Number.isInteger(id)) ||
      new Set(v.lobby_tags).size !== v.lobby_tags.length
    )
      return "请选择联机大厅专区分类";
    if (options) {
      if (
        v.lobby_tags.some((id) => !options.lobbyTags?.some((t) => t.id === id)) ||
        (options.lobbyTagLimit && v.lobby_tags.length > options.lobbyTagLimit)
      )
        return "联机大厅分类已变化或超过数量限制";
      const competitive = v.lobby_tags.includes(options.lobbyCompetitiveTagId ?? -1);
      if (v.is_lobby_competitive !== competitive || (competitive && v.lobby_tags.length !== 1))
        return "竞技模式须单独选择";
    }
    if (v.is_lobby_competitive) {
      if (
        Number(v.lobby_player_num) < 1 ||
        Number(v.lobby_player_num) > 15 ||
        Number(v.lobby_reconnect_time) < 1 ||
        Number(v.lobby_reconnect_time) > 99
      )
        return "竞技开始人数为 1–15，逃跑时间为 1–99 分钟";
      if (
        v.is_asymmetric &&
        (!Array.isArray(v.lobby_camps) ||
          v.lobby_camps.length < 2 ||
          v.lobby_camps.length > 15 ||
          v.lobby_camps.some((c) => typeof c !== "string" || !c.trim() || c.length > 50))
      )
        return "请填写至少两个有效的阵营名称";
    }
  }
  if (options && v.sync_pc_flag && ("sync_item_info" in patch || "sync_pc_flag" in patch)) {
    const pc = v.sync_item_info;
    if (
      !isWorkRecord(pc) ||
      !options.pcTypes.some((t) => t.id === pc.pri_type) ||
      !options.pcScopes.some((s) => s.id === pc.available_scope)
    )
      return "请完善有效的 PC 资源类别和适用范围";
    const subs = options.pcSubTypes[String(pc.pri_type)] ?? [];
    if (subs.length && !subs.some((s) => s.id === pc.sub_type)) return "PC 具体类别无效";
    if (Array.isArray(pc.tag) && pc.tag.some((id) => !options.pcTags.some((t) => t.id === id)))
      return "PC 标签已变化，请重新选择";
  }
  return null;
}

/** Keep paired dependency fields consistent and force prerequisite-only listing rules */
export function normalizeWorkAdvanced(body: WorkRecord, syncDependencies = true): WorkRecord {
  const v = { ...body };
  if (isWorkRecord(v.sync_item_info) && v.sync_item_info.requirement !== undefined)
    v.sync_item_info = { ...v.sync_item_info, requirement: normalizePcRequirements(v.sync_item_info.requirement) };
  if (syncDependencies && Array.isArray(v.prerequisite_items))
    v.prerequisite_item_ids = v.prerequisite_items.filter(isWorkRecord).map((r) => String(r.item_id));
  if (v.pri_type === 9)
    Object.assign(v, {
      price_type: "free",
      price_rank: -4,
      price: 0,
      discount: [],
      sync_pc_flag: false,
      prerequisite_items: [],
      prerequisite_item_ids: [],
      pe_is_add_play_plan: false,
      label_type_list: [],
      channel: [],
      video_info_list: [],
      tag: [],
      mount_call_enabled: false,
      is_domain_server_item: 0,
      dlc_info: { dlc_switch: false, dlc_type: "off", master: {}, slave_list: [] },
      relate_item_id: "0",
    });
  return v;
}
