import {
  type IncomeCarryover,
  type IncomeDetail,
  type IncomeDetailParams,
  type IncomeList,
  type IncomeListParams,
  type IncomeRecord,
  isIncomeDetailParams,
  isIncomeListParams,
} from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery } from "../http/client";
import { readNumber, readRecord, readString } from "../http/parse";

/** Normalize the platform's settlement month without accepting calendar overflow */
function monthKey(value: unknown): string {
  const text = readString(value) ?? "";
  const match = /^(\d{4})-?(0[1-9]|1[0-2])$/.exec(text);
  if (!match) throw new Error("收益记录的月份无效");
  return `${match[1]}-${match[2]}`;
}

/** Read decimal yuan exactly to cents; missing amounts stay unavailable */
function money(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if ((typeof value !== "string" && typeof value !== "number") || !/^-?\d+(?:\.\d{1,2})?$/.test(String(value)))
    throw new Error("收益记录包含无效金额");
  const amount = Number(value);
  if (!Number.isSafeInteger(Math.round(amount * 100))) throw new Error("收益金额超出支持范围");
  return amount;
}

/** Add known amounts in cents without treating missing values as zero */
function sumMoney(values: (number | null)[]): number | null {
  if (values.some((value) => value === null)) return null;
  const cents = values.reduce<number>((sum, value) => sum + Math.round((value as number) * 100), 0);
  if (!Number.isSafeInteger(cents)) throw new Error("收益合计超出支持范围");
  return cents / 100;
}

/** Normalize carryover months, which belong to the selected settlement only */
function carryover(value: unknown): IncomeCarryover[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) throw new Error("可结算月份不是数组");
  const months = value.map((item) => {
    const row = readRecord(item);
    return { month: monthKey(row.data_month), incomeYuan: money(row.income) };
  });
  if (new Set(months.map((item) => item.month)).size !== months.length) throw new Error("可结算月份重复");
  return months;
}

/** Whitelist financial fields; bank, identity and account details never reach the renderer */
function record(value: unknown): IncomeRecord {
  const row = readRecord(value);
  const id = readString(row._id ?? row.id);
  if (!id || !isIncomeDetailParams({ id })) throw new Error("收益记录缺少有效标识");
  if (row.platform !== "pe" && row.platform !== "pc") throw new Error("收益记录的平台无效");
  const status = readString(row.status);
  if (!status) throw new Error("收益记录缺少结算状态");
  const incomeYuan = money(row.income);
  const taxYuan = money(row.tax);
  const serviceFeeYuan = money(row.tech_service_fee);
  const usageFeeYuan = money(row.total_usage_price);
  const diamonds = readNumber(row.total_diamond);
  if (diamonds !== null && !Number.isSafeInteger(diamonds)) throw new Error("收益记录的钻石数量无效");
  const cost = readNumber(row.channel_ip_cost);
  const flow = readNumber(row.sharable_flow);
  const costRate = diamonds !== null && diamonds > 0 && cost !== null && cost >= 0 && cost <= diamonds && (cost > 0 || flow === diamonds)
    ? cost / diamonds : null;
  return {
    ...(costRate === null ? {} : { platformCostRate: costRate }),
    id,
    month: monthKey(row.data_month),
    platform: row.platform,
    status,
    incomeYuan,
    incentiveYuan: money(row.incentive_income),
    playPlanYuan: money(row.play_plan_income),
    taxYuan,
    serviceFeeYuan,
    usageFeeYuan,
    netYuan: sumMoney([
      incomeYuan,
      taxYuan === null ? null : -taxYuan,
      serviceFeeYuan === null ? null : -serviceFeeYuan,
      usageFeeYuan === null ? null : -usageFeeYuan,
    ]),
    availableYuan: money(row.available_income),
    diamonds,
    operatedAt: readString(row.op_time),
    carryover: carryover(row.available_detail),
  };
}

/** Parse all monthly settlements and report incomplete or malformed responses as failures */
export function readIncomeList(value: unknown, platform: IncomeListParams["platform"]): Result<IncomeList> {
  try {
    const payload = readRecord(value);
    if (!Array.isArray(payload.incomes)) throw new Error("收益列表缺少 incomes 数组");
    const total = readNumber(payload.count);
    if (total === null || !Number.isSafeInteger(total) || total < 0 || total !== payload.incomes.length)
      throw new Error("收益记录数量不完整，请刷新重试");
    const records = payload.incomes
      .map(record)
      .sort((a, b) => b.month.localeCompare(a.month) || a.id.localeCompare(b.id));
    if (new Set(records.map((entry) => entry.id)).size !== records.length) throw new Error("收益列表包含重复记录");
    if (records.some((entry) => entry.platform !== platform)) throw new Error("收益记录与请求平台不一致");
    return ok({
      records,
      total,
      incomeYuan: sumMoney(records.map((entry) => entry.incomeYuan)),
      netYuan: sumMoney(records.map((entry) => entry.netYuan)),
      paidYuan: sumMoney(records.filter((entry) => entry.status === "pay_success").map((entry) => entry.netYuan)),
      unsettledCount: records.filter((entry) => entry.status === "init").length,
    });
  } catch (error) {
    return fail({
      kind: "parse",
      endpoint: "incomes",
      detail: error instanceof Error ? error.message : "收益数据格式无效",
    });
  }
}

/** Parse one settlement and preserve only the financial fields used by its detail view */
export function readIncomeDetail(value: unknown, id: string): Result<IncomeDetail> {
  try {
    const row = readRecord(value);
    const detail = record(row);
    if (detail.id !== id) throw new Error("收益详情与请求记录不一致");
    return ok({
      ...detail,
      settlementType: readString(row.type),
      adjustmentYuan: money(row.adjust_money),
      advertisingYuan: money(readRecord(row.extra_info).adv_income),
    });
  } catch (error) {
    return fail({
      kind: "parse",
      endpoint: "incomes.detail",
      detail: error instanceof Error ? error.message : "收益详情格式无效",
    });
  }
}

/** Fetch all monthly records using the reference client's supported span parameter */
export async function getIncomeList(session: NeteaseSession, params: IncomeListParams): Promise<Result<IncomeList>> {
  if (!isIncomeListParams(params))
    return fail({ kind: "business", code: "invalid_params", message: "收益平台参数无效" });
  const result = await getMcDevData(
    "incomes",
    withQuery("/incomes", { platform: params.platform, start: 0, span: 2_147_483_647 }),
    session,
  );
  return result.ok ? readIncomeList(result.value, params.platform) : result;
}

/** Fetch a single read-only settlement detail through the existing authenticated transport */
export async function getIncomeDetail(
  session: NeteaseSession,
  params: IncomeDetailParams,
): Promise<Result<IncomeDetail>> {
  if (!isIncomeDetailParams(params))
    return fail({ kind: "business", code: "invalid_params", message: "收益记录参数无效" });
  const result = await getMcDevData("incomes.detail", `/incomes/${encodeURIComponent(params.id)}`, session);
  return result.ok ? readIncomeDetail(result.value, params.id) : result;
}
