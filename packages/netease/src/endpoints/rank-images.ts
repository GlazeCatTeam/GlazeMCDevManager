import { createHash } from "node:crypto";
import { isNeteaseImageUrl } from "../http/hosts";
import { readArray, readRecord, readString } from "../http/parse";

const endpoint = "https://g79apigatewayobt.nie.netease.com/h5/pe-item/query/search-by-id-list";
const icons = new Map<string, { url: string; expires: number }>();
const pending = new Map<string, Promise<Map<string, string>>>();
const TTL = 30 * 60_000;

/** Read public share-page thumbnails in one batch, without developer cookies or private metadata */
async function fetchIcons(ids: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  // Public H5 request checksum, as used by resource-minecraft.h5.163.com
  const params = { channel_id: 5, item_id_list: ids };
  const sign = createHash("md5")
    .update(`channel_id=5&item_id_list=${JSON.stringify(ids)}&mc#h5page#web`)
    .digest("hex");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, sign }),
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return found;
    const raw = readRecord(await response.json());
    if (raw.code !== 0) return found;
    for (const row of readArray(raw.entities) ?? []) {
      const id = readString(row.item_id);
      const url = readString(row.title_image_url);
      if (id && ids.includes(id) && url && isNeteaseImageUrl(url)) {
        found.set(id, url);
        icons.delete(id);
        icons.set(id, { url, expires: Date.now() + TTL });
      }
    }
    while (icons.size > 500) icons.delete(icons.keys().next().value as string);
  } catch {
    // Missing public metadata must not turn a successful ranking into a failed query
  }
  return found;
}

/** Reuse successful thumbnails across categories; transient failures remain retryable */
export async function getRankIcons(itemIds: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const missing: string[] = [];
  for (const id of new Set(itemIds)) {
    if (!/^\d{1,32}$/.test(id)) continue;
    const cached = icons.get(id);
    if (cached && cached.expires > Date.now()) found.set(id, cached.url);
    else missing.push(id);
  }
  if (!missing.length) return found;
  const key = JSON.stringify(missing.sort());
  let request = pending.get(key);
  if (!request) {
    request = fetchIcons(missing).finally(() => pending.delete(key));
    pending.set(key, request);
  }
  for (const [id, url] of await request) found.set(id, url);
  return found;
}
