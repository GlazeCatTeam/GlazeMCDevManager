import { callHost, onHostEvent } from "./context/session";
import { WorkArchiveStore } from "./work-archive-store";

/** Keep the old key as a recovery copy; the host imports it only once */
export function archiveStorageKey(account: string): string {
  return `glaze:works:archived:v1:${account}`;
}

/** Migrate renderer-only records before either UI or AI tools expose account works */
async function readWorkArchive(account: string): Promise<string[]> {
  const state = await callHost("works.archiveState", { account });
  if (state.ok) return state.value;
  if (state.error.kind !== "archive_not_ready") throw new Error(state.error.message);
  const legacy: unknown = JSON.parse(localStorage.getItem(archiveStorageKey(account)) ?? "[]");
  if (!Array.isArray(legacy) || legacy.some((id) => typeof id !== "string" || !/^\d{1,32}$/.test(id)))
    throw new Error("旧归档记录格式无效，原记录已保留");
  const result = await callHost("works.archiveMigrate", { account, itemIds: legacy });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const archives = new WorkArchiveStore(readWorkArchive, (receive) => {
  onHostEvent("works.archiveChanged", ({ account, itemIds }) => receive(account, itemIds));
});

export const workArchiveSnapshot = (account: string) => archives.snapshot(account);
export const subscribeWorkArchive = (account: string, notify: () => void) => archives.subscribe(account, notify);
export const initializeWorkArchive = (account: string, refresh = false) => archives.load(account, refresh);
