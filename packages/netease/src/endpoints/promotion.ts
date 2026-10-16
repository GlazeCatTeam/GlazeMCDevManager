import {
  type BannerApplication,
  type BannerSaveParams,
  isBannerSave,
  isPromotionId,
  isPromotionJoin,
  isPromotionModule,
  isPromotionPage,
  type PromotionActivity,
  type PromotionDates,
  type PromotionJoinParams,
  type PromotionModuleData,
  type PromotionModuleParams,
  type PromotionPageParams,
  type PromotionWork,
} from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery, writeMcDevData } from "../http/client";
import { isNeteaseImageUrl } from "../http/hosts";
import { readNumber, readRecord, readString } from "../http/parse";

const reviewPath = "/activities/pe-review-activities";
const discountPath = "/activities/discount_activities";

/** Read required arrays strictly so damaged responses never masquerade as empty lists */
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("活动数据缺少列表字段");
  return value;
}

/** Read safe nonnegative platform timestamps, counts and percentages */
function integer(value: unknown): number {
  const number = readNumber(value);
  if (number === null || !Number.isSafeInteger(number) || number < 0) throw new Error("活动数值字段无效");
  return number;
}

/** Preserve platform IDs as strings, including numeric module identifiers */
function id(value: unknown): string {
  const text = readString(value);
  if (!isPromotionId(text)) throw new Error("活动标识无效");
  return text;
}

/** Keep descriptions as text; renderer never executes upstream HTML */
function text(value: unknown): string {
  return readString(value) ?? "";
}

/** Normalize either activity type using explicit platform fields */
export function readPromotionActivity(value: unknown): PromotionActivity {
  const row = readRecord(value);
  return {
    id: id(row.activity_id),
    name: text(row.activity_name),
    description: text(row.activity_description),
    instruction: text(row.activity_instruction),
    banner: readString(row.banner),
    beginAt: integer(row.begin_at),
    applyEndAt: integer(row.apply_end_at),
    endAt: integer(row.end_at),
    modules: array(row.activity_modules).map((value) => {
      const module = readRecord(value);
      return {
        id: id(module.module_id),
        name: text(module.module_name),
        description: text(module.module_description),
        minDiscount: readNumber(module.min_discount),
        maxDiscount: readNumber(module.max_discount),
        minDiamond: readNumber(module.min_diamond),
        priceUpdateDays: readNumber(module.price_update_limit_day),
      };
    }),
    partitions: array(row.activity_partition ?? []).map((value) => {
      const partition = readRecord(value);
      return {
        id: id(partition.partition_id),
        name: text(partition.partition_name),
        rule: text(partition.partition_rule),
      };
    }),
  };
}

/** Preserve unknown review statuses and missing prices in candidate and joined lists */
function readItems(value: unknown): PromotionWork[] {
  const rows = array(readRecord(value).items).map((value) => {
    const row = readRecord(value);
    return {
      id: id(row.item_id),
      name: text(row.item_name),
      price: readNumber(row.price),
      priceType: text(row.price_type),
      status: text(row.status ?? row.discount_activity_status),
      discount: readNumber(row.discount_activity_discount),
    };
  });
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error("活动作品标识重复");
  return rows;
}

/** Convert a single successful payload; failures keep the transport error intact */
async function query<T>(
  session: NeteaseSession,
  endpoint: string,
  path: string,
  parse: (value: unknown) => T,
): Promise<Result<T>> {
  const result = await getMcDevData(endpoint, path, session);
  if (!result.ok) return result;
  try {
    return ok(parse(result.value));
  } catch (error) {
    return fail({ kind: "parse", endpoint, detail: error instanceof Error ? error.message : "活动数据无法识别" });
  }
}

/** Reject invalid inputs before any network request */
function invalid<T>(message = "活动参数无效，请刷新后重试"): Result<T> {
  return fail({ kind: "business", code: "validation", message });
}

/** Read review activities with the platform's offset pagination */
export async function getPromotionActivities(
  session: NeteaseSession,
  params: PromotionPageParams,
): Promise<Result<{ records: PromotionActivity[]; total: number }>> {
  if (!isPromotionPage(params)) return invalid();
  return query(
    session,
    "promotion.activities",
    withQuery(reviewPath, { start: params.page * 10, span: 10 }),
    (value) => {
      const row = readRecord(value);
      return { records: array(row.data).map(readPromotionActivity), total: integer(row.count) };
    },
  );
}

/** Recognize verified empty campaign payloads while rejecting malformed active records */
export async function getPromotionDiscount(
  session: NeteaseSession,
): Promise<Result<{ activity: PromotionActivity | null }>> {
  return query(session, "promotion.discount", `${discountPath}/current`, (value) => {
    const row = readRecord(value);
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(row).length === 0)
      return { activity: null };
    // The live platform also represents no current campaign as a zero-filled activity shell
    if (
      row.activity_id === "" &&
      row.activity_name === "" &&
      row.activity_description === "" &&
      row.activity_instruction === "" &&
      row.status === "" &&
      row.activity_type === 0 &&
      row.begin_at === 0 &&
      row.apply_end_at === 0 &&
      row.end_at === 0 &&
      row.activity_modules === undefined &&
      row.activity_partition === undefined
    )
      return { activity: null };
    return { activity: readPromotionActivity(value) };
  });
}

/** Fetch both lists; a failed half is never silently shown as an empty section */
export async function getPromotionModule(
  session: NeteaseSession,
  params: PromotionModuleParams,
): Promise<Result<PromotionModuleData>> {
  if (!isPromotionModule(params)) return invalid();
  const base = `${reviewPath}/${params.activityId}/modules/${params.moduleId}`;
  const paths =
    params.kind === "review"
      ? [`${base}/candidates`, `${base}/items`]
      : [
          withQuery(`${discountPath}/candidates`, { activity_id: params.activityId, module_id: params.moduleId }),
          `${discountPath}/current/modules/${params.moduleId}/items`,
        ];
  const results = await Promise.all(paths.map((path) => query(session, "promotion.module", path, readItems)));
  const candidates = results[0];
  const joined = results[1];
  if (!candidates || !joined) return invalid();
  if (!candidates.ok) return candidates;
  if (!joined.ok) return joined;
  return ok({ candidates: candidates.value, joined: joined.value });
}

/** Preserve exact server date keys and unavailable reasons */
export function readPromotionDates(value: unknown): PromotionDates {
  const row = readRecord(value);
  if (!row.permit || typeof row.permit !== "object" || Array.isArray(row.permit)) throw new Error("缺少可申请日期");
  const reason = readRecord(row.reason);
  const recent = readRecord(row.recent_records);
  return {
    dates: Object.entries(row.permit)
      .map(([key, allowed]) => {
        if (typeof allowed !== "boolean" || !/^\d+$/.test(key)) throw new Error("可申请日期格式无效");
        return { time: integer(key), allowed, reason: text(reason[key]), recent: recent[key] === true };
      })
      .sort((a, b) => a.time - b.time),
  };
}

/** Read banner eligibility without converting its epoch seconds to local dates */
export async function getPromotionDates(session: NeteaseSession): Promise<Result<PromotionDates>> {
  return query(session, "promotion.dates", "/promotion-banner/pe/can_apply", readPromotionDates);
}

/** Read banner history and fields required to modify an existing application */
export async function getPromotionApplications(
  session: NeteaseSession,
  params: PromotionPageParams,
): Promise<Result<{ records: BannerApplication[]; total: number }>> {
  if (!isPromotionPage(params)) return invalid();
  return query(
    session,
    "promotion.applications",
    withQuery("/promotion-banner/user-applications", {
      start: params.page * 10,
      span: 10,
      platform: "pe",
      type: "apply",
    }),
    (value) => {
      const row = readRecord(value);
      return {
        total: integer(row.count),
        records: array(row.applications).map((value) => {
          const item = readRecord(value);
          return {
            id: id(item.application_id),
            itemId: id(item.item_id),
            itemName: text(item.item_name),
            startTime: integer(item.start_time),
            applyTime: integer(item.apply_time),
            status: text(item.status),
            position: text(item.position_name),
            imageUrl: text(item.pe_channel),
            extra: text(item.extra),
            activity: text(item.activity),
            feature: text(item.feature),
            update: text(item.update),
          };
        }),
      };
    },
  );
}

/** Send exactly one explicit mutation; transport does not retry POST or PUT */
async function write(
  session: NeteaseSession,
  path: string,
  body: unknown,
  method: "POST" | "PUT" = "POST",
): Promise<Result<undefined>> {
  const result = await writeMcDevData("promotion.write", path, session, method, JSON.stringify(body));
  return result.ok ? ok(undefined) : result;
}

/** Revalidate candidate membership and live discount constraints before registration */
export async function joinPromotion(session: NeteaseSession, params: PromotionJoinParams): Promise<Result<undefined>> {
  if (!isPromotionJoin(params)) return invalid();
  if (params.kind === "discount") {
    const result = await getPromotionDiscount(session);
    if (!result.ok) return result;
    const activity = result.value.activity;
    const module = activity?.modules.find((item) => item.id === params.moduleId);
    if (
      activity?.id !== params.activityId ||
      !module ||
      module.minDiscount === null ||
      module.maxDiscount === null ||
      params.discount < module.minDiscount ||
      params.discount > module.maxDiscount ||
      (params.partitionId && !activity.partitions.some((item) => item.id === params.partitionId)) ||
      Date.now() / 1000 > activity.applyEndAt
    )
      return invalid("活动或折扣规则已变化，请刷新后重新选择");
  }
  const module = await getPromotionModule(session, params);
  if (!module.ok) return module;
  if (
    params.itemIds.some(
      (itemId) =>
        !module.value.candidates.some((item) => item.id === itemId) ||
        module.value.joined.some((item) => item.id === itemId),
    )
  )
    return invalid("所选作品已报名或不再符合条件，请刷新列表");
  if (params.kind === "review")
    return write(session, `${reviewPath}/${params.activityId}/modules/${params.moduleId}/join`, {
      item_id: params.itemIds[0],
      apply_intro: params.intro,
      image_list: params.images,
      video_info_list: params.videos,
    });
  return write(session, `${discountPath}/join`, {
    activity_id: params.activityId,
    module_id: params.moduleId,
    item_id_list: params.itemIds,
    discount: params.discount,
    partition_id: params.partitionId,
    intro: params.intro,
  });
}

/** Cancel only the campaign still reported as current by the platform */
export async function cancelPromotionDiscount(
  session: NeteaseSession,
  params: { activityId: string; itemId: string },
): Promise<Result<undefined>> {
  if (!isPromotionId(params.activityId) || !isPromotionId(params.itemId)) return invalid();
  const current = await getPromotionDiscount(session);
  if (!current.ok) return current;
  if (current.value.activity?.id !== params.activityId) return invalid("当前活动已变化，请刷新后重试");
  return write(session, `${discountPath}/cancel_join`, { activity_id: params.activityId, item_id: params.itemId });
}

/** Validate date availability for new applications and keep the established PE wire fields */
export async function savePromotionBanner(
  session: NeteaseSession,
  params: BannerSaveParams,
): Promise<Result<undefined>> {
  if (!isBannerSave(params) || !isNeteaseImageUrl(params.imageUrl))
    return invalid("请完整填写申请并上传有效的网易宣传图");
  if (!params.applicationId) {
    const dates = await getPromotionDates(session);
    if (!dates.ok) return dates;
    if (!dates.value.dates.some((date) => date.time === params.startTime && date.allowed))
      return invalid("该日期已不可申请，请刷新日期后重新选择");
  }
  const body = {
    position_id: "6",
    start_time: params.startTime,
    item_id: params.itemId,
    item_category: "pe",
    extra: params.extra,
    activity: params.activity,
    feature: params.feature,
    update: params.update,
    pe_channel: params.imageUrl,
    special_promotion: false,
    start_time_zone: -8,
    is_check: true,
  };
  return write(
    session,
    params.applicationId ? `/promotion-banner/apply/modify/${params.applicationId}` : "/promotion-banner/apply/",
    body,
    params.applicationId ? "PUT" : "POST",
  );
}
