import { isWorkSearchParams, type WorkReference, type WorkSearchParams } from "@glaze/contracts";
import { fail, ok, type Result } from "../errors";
import { getMcDevData, type NeteaseSession, withQuery } from "../http/client";
import { readRecord, readString } from "../http/parse";

/** Search audited PE/PC pools without fetching every work or rounding identifiers */
export async function searchWorkReferences(
  session: NeteaseSession,
  params: WorkSearchParams,
): Promise<Result<WorkReference[]>> {
  if (!isWorkSearchParams(params)) return fail({ kind: "business", code: "validation", message: "模组搜索参数无效" });
  const query = params.query.trim();
  const path =
    params.kind === "pcPrerequisite"
      ? withQuery("/items/categories/comp/requirements", { query_str: query })
      : withQuery("/items/categories/pe/", {
          item_name: query,
          start: 0,
          span: 20,
          pri_type: params.kind === "pePrerequisite" ? 9 : undefined,
          mc_status: params.kind === "related" ? 1 : undefined,
        });
  const result = await getMcDevData("items.references", path, session);
  if (!result.ok) return result;
  const rows = readRecord(result.value)?.item;
  if (!Array.isArray(rows)) return fail({ kind: "parse", endpoint: "items.references" });
  const found: WorkReference[] = [];
  for (const value of rows) {
    const row = readRecord(value);
    const itemId = readString(row?.item_id);
    const name = readString(row?.item_name);
    if (!itemId || !/^\d{1,32}$/.test(itemId) || !name) return fail({ kind: "parse", endpoint: "items.references" });
    if (!found.some((item) => item.itemId === itemId)) found.push({ itemId, name });
  }
  return ok(found.slice(0, 20));
}
