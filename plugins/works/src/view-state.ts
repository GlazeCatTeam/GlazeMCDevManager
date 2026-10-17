import type { WorkPage } from "@glaze/plugin-sdk";

export interface WorkListView {
  page: number;
  data: WorkPage;
}
type Position = { page: number; scrollTop: number };
const positions = new Map<string, { archived: boolean; normal: Position; archive: Position }>();

export function workListMode(account: string): boolean {
  return positions.get(account)?.archived ?? false;
}

/** Keep only a small account-local navigation position, never credentials or persisted data */
export function workListPosition(account: string, archived = false): Position {
  const saved = positions.get(account);
  return (archived ? saved?.archive : saved?.normal) ?? { page: 0, scrollTop: 0 };
}

/** Remember the displayed page, rather than a request which has not completed */
export function rememberWorkListPosition(account: string, page: number, scrollTop: number, archived = false): void {
  const previous = positions.get(account) ?? {
    archived,
    normal: { page: 0, scrollTop: 0 },
    archive: { page: 0, scrollTop: 0 },
  };
  positions.delete(account);
  positions.set(account, { ...previous, archived, [archived ? "archive" : "normal"]: { page, scrollTop } });
  if (positions.size > 5) positions.delete(positions.keys().next().value as string);
}

/** Switching accounts or logging out also resets remembered navigation */
export function clearWorkListPositions(): void {
  positions.clear();
}

/** Keep the last usable page visible until the target page is ready, without relabeling old rows */
export function selectWorkListView(
  page: number,
  data: WorkPage | null,
  previous: WorkListView | null,
): WorkListView | null {
  if (data && (data.total === 0 || page < Math.ceil(data.total / 9))) return { page, data };
  return previous;
}
