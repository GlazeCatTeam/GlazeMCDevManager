import {
  hostQuerySnapshot,
  type QuerySnapshot,
  type RankEntry,
  type RpcMethods,
  readHostQuery,
  remoteImageUrl,
} from "@glaze/plugin-sdk";

export type HomeMethod =
  | "rank.list"
  | "rank.page"
  | "rank.icons"
  | "developer.level"
  | "analytics.overview"
  | "income.estimate";

// Home numbers change slowly; a minute of reuse keeps tab and page switches instant
export const HOME_TTL = 60_000;
const warmedImages = new Set<string>();

/** Decode prefetched thumbnails before the user opens their tab, without delaying ranking text */
export function warmImages(rows: RankEntry[]): void {
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

/** Current shared snapshot for a home key */
export function homeEntry(key: string): { snapshot: QuerySnapshot } {
  return { snapshot: hostQuerySnapshot(key) };
}

/** Read through the shared SDK cache, warming ranking thumbnails after each success */
export function readHome<M extends HomeMethod>(
  key: string,
  method: M,
  params: RpcMethods[M]["params"],
  force = false,
): Promise<void> {
  return readHostQuery(key, method, params, { force, ttl: HOME_TTL }).then(() => {
    const data = hostQuerySnapshot(key).data;
    if (data && method === "rank.list") warmImages(data as RankEntry[]);
    if (data && method === "rank.page") warmImages((data as RpcMethods["rank.page"]["result"]).items);
  });
}
