import type { WorkSearchPageParams, WorkSearchParams, WorkSummary } from "@glaze/contracts";
import { getWorksPage, listWorks, searchWorkReferences, searchWorks } from "@glaze/netease";
import type { SessionManager } from "../session/session-manager";
import type { WorkArchiveService } from "../works/archive";

/** Apply local archive visibility before returning content or computing public totals */
export function createMcpWorkReads(sessions: Pick<SessionManager, "request">, archives: WorkArchiveService) {
  return async (method: string, params: Record<string, unknown>, guard: () => void = () => {}) => {
    const account = params.account as string;
    const include = params.includeArchived === true;
    const hidden = () => {
      const ids = archives.get(account);
      return new Set(include ? [] : ids);
    };
    const filter = <T extends { itemId: string }>(items: T[]): T[] => {
      guard();
      const ids = hidden();
      return items.filter((item) => !ids.has(item.itemId));
    };
    const list = async (): Promise<WorkSummary[]> =>
      filter(
        await sessions.request(account, (session) =>
          listWorks({ ...session, beforeRequest: guard }, (params.platform as "pe" | "pc") ?? "pe"),
        ),
      );
    hidden();
    guard();
    if (method === "works.archiveState") return archives.get(account);
    if (method === "works.list") return list();
    if (method === "works.page") {
      const page = params.page as number;
      const pageSize = params.pageSize as number;
      if (hidden().size === 0) {
        const result = await sessions.request(account, (session) =>
          getWorksPage({ ...session, beforeRequest: guard }, page, pageSize),
        );
        if (hidden().size === 0) {
          guard();
          return result;
        }
      }
      const items = await list();
      return { items: items.slice(page * pageSize, (page + 1) * pageSize), total: items.length };
    }
    if (method === "works.searchReferences") {
      const { includeArchived: _include, ...input } = params;
      return filter(
        await sessions.request(account, (session) =>
          searchWorkReferences({ ...session, beforeRequest: guard }, input as unknown as WorkSearchParams),
        ),
      );
    }
    const { includeArchived: _include, ...input } = params;
    const query = input as unknown as WorkSearchPageParams;
    if (query.kind === "id" && hidden().has(query.query.trim())) return { items: [], total: 0 };
    if (hidden().size === 0) {
      const result = await sessions.request(account, (session) =>
        searchWorks({ ...session, beforeRequest: guard }, query),
      );
      if (hidden().size === 0) {
        guard();
        return result;
      }
    }
    // Preserve the platform's search semantics while excluding archived rows before pagination
    const matches: { itemId: string; name: string; status: WorkSummary["status"] }[] = [];
    let page = 0;
    let total = 0;
    do {
      guard();
      const result = await sessions.request(account, (session) =>
        searchWorks({ ...session, beforeRequest: guard }, { ...query, page, pageSize: 50 }),
      );
      matches.push(...result.items);
      total = result.total;
      page++;
    } while (query.kind !== "id" && page * 50 < total);
    const items = filter(matches);
    return { items: items.slice(query.page * query.pageSize, (query.page + 1) * query.pageSize), total: items.length };
  };
}
