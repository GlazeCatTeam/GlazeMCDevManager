import type { WorkPage, WorkSummary } from "@glaze/plugin-sdk";

/** Filter before slicing so hidden works cannot leave holes or incorrect page counts */
export function archiveWorkPage(
  works: WorkSummary[],
  archivedIds: readonly string[],
  archived: boolean,
  page: number,
  pageSize: number,
): WorkPage {
  const ids = new Set(archivedIds);
  const visible = works.filter((work) => ids.has(work.itemId) === archived);
  return { items: visible.slice(page * pageSize, (page + 1) * pageSize), total: visible.length };
}
