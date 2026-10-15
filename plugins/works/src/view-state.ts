import type { WorkPage } from "@glaze/plugin-sdk";

export interface WorkListView {
  page: number;
  data: WorkPage;
}
const positions = new Map<string, { page: number; scrollTop: number }>();

/** Keep only a small account-local navigation position, never credentials or persisted data */
export function workListPosition(account: string): { page: number; scrollTop: number } {
  return positions.get(account) ?? { page: 0, scrollTop: 0 };
}

/** Remember the displayed page, rather than a request which has not completed */
export function rememberWorkListPosition(account: string, page: number, scrollTop: number): void {
  positions.delete(account);
  positions.set(account, { page, scrollTop });
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
