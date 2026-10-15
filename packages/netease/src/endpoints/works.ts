import type {
  IncomePlatform,
  WorkDetail,
  WorkPage,
  WorkPriceType,
  WorkReviewFeedback,
  WorkStatus,
  WorkSummary,
} from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery } from "../http/client";
import { readArray, readNumber, readRecord, readString } from "../http/parse";

/** Store picture slot holding the square 1:1 work icon; the other slots are 16:9 screenshots */
const ICON_CHANNEL_ID = 5;
/** Prerequisite (前置) mods are free and never sell */
const PREREQUISITE_PRI_TYPE = 9;
const ALL = 2_147_483_647;

const knownStatuses = new Set<WorkStatus>([
  "online",
  "init",
  "preparing",
  "reviewing",
  "self_test",
  "self_test_prepare",
  "reject",
  "accept",
  "appoint_online",
  "online_preparing",
  "offline",
  "system_offline",
]);

const priceTypes = new Set<WorkPriceType>(["diamond", "point", "free"]);

/** Platform status string to a known status */
export function readWorkStatus(value: unknown): WorkStatus {
  const status = readString(value);
  return status !== null && knownStatuses.has(status as WorkStatus) ? (status as WorkStatus) : "unknown";
}

/** One work from a list row, or null when its id or name is missing */
function readWork(row: Record<string, unknown>): WorkSummary | null {
  const itemId = readString(row.item_id);
  const name = readString(row.item_name);
  const createTime = readString(row.create_time);
  if (itemId === null || name === null || createTime === null) {
    return null;
  }
  const priceType = readString(row.price_type);
  return {
    itemId,
    name,
    status: readWorkStatus(row.status),
    price: readNumber(row.price) ?? 0,
    priceType: priceType !== null && priceTypes.has(priceType as WorkPriceType) ? (priceType as WorkPriceType) : "free",
    isOriginal: row.is_original === true,
    syncPc: row.sync_pc_flag === true,
    isPrerequisite: readNumber(row.pri_type) === PREREQUISITE_PRI_TYPE,
    weakOffline: row.weak_offline === true,
    weakOfflineReason: readString(row.weak_offline_reason),
    createTime,
    applyReviewTime: readString(row.apply_review_time),
    onlineTime: readString(row.online_time),
  };
}

/** List works from one platform; PC resources use the upstream comp category */
export async function listWorks(
  session: NeteaseSession,
  platform: IncomePlatform = "pe",
): Promise<Result<WorkSummary[]>> {
  if (platform !== "pe" && platform !== "pc")
    return fail({ kind: "business", code: "invalid_params", message: "资源平台无效" });
  const category = platform === "pc" ? "comp" : "pe";
  const result = await getMcDevData(
    `items.${category}`,
    withQuery(`/items/categories/${category}/`, { start: 0, span: ALL }),
    session,
  );
  if (!result.ok) {
    return result;
  }
  const rows = readArray(readRecord(result.value).item);
  if (rows === null) {
    return fail({ kind: "parse", endpoint: `items.${category}` });
  }
  const works: WorkSummary[] = [];
  for (const row of rows) {
    const work = readWork(row);
    if (work === null) {
      return fail({ kind: "parse", endpoint: `items.${category}` });
    }
    works.push(work);
  }
  return ok(works);
}

/** Fetch only the requested visible rows; keep the full-list API for reports and selectors */
export async function getWorksPage(session: NeteaseSession, page: number, pageSize: number): Promise<Result<WorkPage>> {
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 50 ||
    !Number.isSafeInteger(page * pageSize)
  )
    return fail({ kind: "business", code: "validation", message: "作品分页参数无效" });
  const result = await getMcDevData(
    "items.pe.page",
    withQuery("/items/categories/pe/", { start: page * pageSize, span: pageSize }),
    session,
  );
  if (!result.ok) return result;
  const raw = readRecord(result.value);
  const total = readNumber(raw.count);
  const rows = readArray(raw.item);
  if (total === null || !Number.isSafeInteger(total) || total < 0 || rows === null || rows.length > pageSize)
    return fail({ kind: "parse", endpoint: "items.pe.page" });
  const items: WorkSummary[] = [];
  for (const row of rows) {
    const work = readWork(row);
    if (!work) return fail({ kind: "parse", endpoint: "items.pe.page" });
    items.push(work);
  }
  return ok({ items, total });
}

/** Icon, banner and go-live times of one of the account's works, from GET /items/categories/pe/{id} */
export async function getWork(session: NeteaseSession, itemId: string): Promise<Result<WorkDetail>> {
  const result = await getMcDevData("items.pe.detail", `/items/categories/pe/${encodeURIComponent(itemId)}`, session);
  if (!result.ok) {
    return result;
  }
  const raw = readRecord(result.value);
  const name = readString(raw.item_name);
  if (name === null) {
    return fail({ kind: "parse", endpoint: "items.pe.detail" });
  }
  return ok({
    itemId,
    name,
    iconUrl: readString(readArray(raw.channel)?.find((c) => readNumber(c.channel_id) === ICON_CHANNEL_ID)?.channel_url),
    bannerUrl: readString(raw.banner_pic),
    onlineTime: readString(raw.online_time),
    firstOnlineTime: readString(raw.first_online_time),
    appointOnlineTime: readString(raw.appoint_online_time),
  });
}

/** Rich feedback is HTML; keep only its text */
function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Latest review feedback of a work, or null when there is none */
export async function getReviewFeedback(
  session: NeteaseSession,
  itemId: string,
): Promise<Result<WorkReviewFeedback | null>> {
  const result = await getMcDevData(
    "items.pe.feedback",
    `/items/categories/pe/${encodeURIComponent(itemId)}/feedback`,
    session,
  );
  if (!result.ok) {
    // An empty payload just means the work has no feedback yet
    return result.error.kind === "parse" ? ok(null) : result;
  }
  const raw = readRecord(result.value);
  const text = plainText(readString(raw.feedback) ?? readString(raw.rich_feedback) ?? "");
  return ok(text.length > 0 ? { text, time: readString(raw.op_time) } : null);
}
