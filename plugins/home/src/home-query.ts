import {
  callHost,
  type HostQuery,
  type RankEntry,
  type RpcMethods,
  type RpcResult,
  remoteImageUrl,
} from "@glaze/plugin-sdk";

export type HomeMethod = "rank.list" | "rank.page" | "developer.level" | "analytics.overview" | "income.estimate";
type HomeData = RpcMethods[HomeMethod]["result"];
type Snapshot = Omit<HostQuery<HomeData>, "reload">;

interface Entry {
  snapshot: Snapshot;
  expires: number;
  listeners: Set<() => void>;
  pending?: Promise<void>;
}

const entries = new Map<string, Entry>();
const TTL = 60_000;
const warmedImages = new Set<string>();

/** Decode prefetched thumbnails before the user opens their tab, without delaying ranking text */
function warmImages(rows: RankEntry[]): void {
  if (typeof Image === "undefined") return;
  for (const row of rows.slice(0, 8)) {
    const src = remoteImageUrl(row.iconUrl);
    if (!src || warmedImages.has(src)) continue;
    warmedImages.add(src);
    const image = new Image();
    image.decoding = "async";
    image.onerror = () => warmedImages.delete(src);
    image.src = src;
    void image.decode().catch(() => warmedImages.delete(src));
  }
  while (warmedImages.size > 160) warmedImages.delete(warmedImages.values().next().value as string);
}

/** Share bounded, account-keyed snapshots across tab switches and home page re-entry */
export function homeEntry(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { snapshot: { data: null, error: null, loading: true }, expires: 0, listeners: new Set() };
    entries.set(key, entry);
    for (const [oldKey, old] of entries) {
      if (entries.size <= 80) break;
      if (oldKey !== key && !old.listeners.size && !old.pending) entries.delete(oldKey);
    }
  }
  return entry;
}

/** Keep snapshot identities stable between updates for useSyncExternalStore */
function publish(entry: Entry, snapshot: Snapshot): void {
  entry.snapshot = snapshot;
  for (const notify of entry.listeners) notify();
}

/** Coalesce concurrent reads and refresh in place, retaining only this key's last successful rows */
export function readHome<M extends HomeMethod>(
  key: string,
  method: M,
  params: RpcMethods[M]["params"],
  force = false,
): Promise<void> {
  const entry = homeEntry(key);
  if (entry.pending) return entry.pending;
  if (!force && entry.expires > Date.now()) return Promise.resolve();
  publish(entry, { ...entry.snapshot, loading: true, error: null });
  entry.pending = Promise.resolve()
    .then(() => callHost(method, params))
    .catch(
      (reason: unknown): RpcResult<RpcMethods[M]["result"]> => ({
        ok: false,
        error: { kind: "internal", message: reason instanceof Error ? reason.message : "查询失败，请重试" },
      }),
    )
    .then((result) => {
      delete entry.pending;
      if (result.ok && method === "rank.list") warmImages(result.value as RankEntry[]);
      if (result.ok && method === "rank.page") warmImages((result.value as RpcMethods["rank.page"]["result"]).items);
      entry.expires = result.ok ? Date.now() + TTL : 0;
      publish(entry, {
        data: result.ok ? result.value : entry.snapshot.data,
        error: result.ok ? null : result.error,
        loading: false,
      });
    });
  return entry.pending;
}
