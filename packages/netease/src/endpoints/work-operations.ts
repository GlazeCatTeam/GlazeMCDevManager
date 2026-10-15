import {
  isWorkOperationParams,
  type WorkOperationMethod,
  type WorkOperationParams,
  type WorkOperationResult,
  workDiamondPrices,
  workOperationStates,
  workScheduleTime,
} from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { type NeteaseSession, writeMcDevData } from "../http/client";
import { getWorkEditorOptions, readWorkEditor } from "./work-editor";

const routes: Record<WorkOperationMethod, { method: "PUT" | "POST" | "DELETE"; suffix: string }> = {
  "works.cancelReview": { method: "PUT", suffix: "/cancel_review" },
  "works.publish": { method: "PUT", suffix: "/online" },
  "works.appointOnline": { method: "PUT", suffix: "/appoint_online" },
  "works.cancelAppointOnline": { method: "PUT", suffix: "/appoint_online" },
  "works.submitSelfTest": { method: "PUT", suffix: "/self-test-apply" },
  "works.cancelTest": { method: "PUT", suffix: "/cancel_self_test" },
  "works.delete": { method: "DELETE", suffix: "" },
  "works.changePrice": { method: "POST", suffix: "/change_price" },
};

/** Recheck the live work and account before issuing exactly one explicit list mutation */
export async function performWorkOperation(
  session: NeteaseSession,
  method: WorkOperationMethod,
  params: WorkOperationParams,
  beforeWrite: () => void = () => {},
): Promise<Result<WorkOperationResult>> {
  if (!isWorkOperationParams(method, params))
    return fail({ kind: "business", code: "validation", message: "作品操作参数无效" });
  const detail = await readWorkEditor(session, params.itemId);
  if (!detail.ok) return detail;
  if (detail.value.status !== params.expectedStatus || !workOperationStates[method].includes(detail.value.status))
    return fail({ kind: "business", code: "conflict", message: "作品状态已变化，请刷新列表后重新操作" });
  let body: Record<string, unknown> | undefined;
  if (method === "works.publish") body = { op_platform: "all" };
  if (method === "works.cancelAppointOnline") body = { appoint_online_time: null };
  if (method === "works.appointOnline") {
    if ((workScheduleTime(params.appointOnlineTime ?? "") ?? 0) <= Date.now())
      return fail({ kind: "business", code: "validation", message: "请选择未来的北京时间" });
    body = { appoint_online_time: params.appointOnlineTime, op_platform: "all" };
  }
  if (method === "works.submitSelfTest") body = { pass_check: params.passCheck };
  if (method === "works.changePrice") {
    const fields = detail.value.fields;
    if (
      fields.pri_type === 9 ||
      fields.price_type !== params.expectedPriceType ||
      fields.price !== params.expectedPrice
    )
      return fail({ kind: "business", code: "conflict", message: "作品定价已变化或不支持调价，请刷新列表后重新操作" });
    const choices = await getWorkEditorOptions(session);
    if (!choices.ok) return choices;
    const rule = choices.value.prices.find((p) => p.id === fields.price_type);
    const price = params.price as number;
    if (
      !rule ||
      price < rule.min ||
      (rule.max !== null && price > rule.max) ||
      (rule.step > 0 && (price - rule.min) % rule.step !== 0)
    )
      return fail({ kind: "business", code: "validation", message: "新价格不符合平台当前范围或步长" });
    const rank =
      fields.price_type === "diamond" ? (workDiamondPrices as readonly number[]).indexOf(price) : fields.price_rank;
    if (typeof rank !== "number" || !Number.isInteger(rank)) return fail({ kind: "parse", endpoint: method });
    body = { price, price_rank: rank, price_type: fields.price_type };
  }
  beforeWrite();
  const route = routes[method];
  const result = await writeMcDevData(
    method,
    `/items/categories/pe/${params.itemId}${route.suffix}`,
    session,
    route.method,
    body === undefined ? undefined : JSON.stringify(body),
  );
  if (result.ok) return ok({ outcome: "completed" });
  const error = result.error;
  if (
    error.kind === "network" ||
    error.kind === "timeout" ||
    error.kind === "parse" ||
    (error.kind === "business" && ((error.httpStatus ?? 0) >= 500 || /^5\d\d$/.test(error.code)))
  )
    return ok({ outcome: "uncertain" });
  return result;
}
