import { REMOTE_IMAGE_SCHEME } from "@glaze/contracts";
import { isNeteaseImageUrl } from "@glaze/netease";
import { protocol } from "electron";

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
/** Images kept in memory; the oldest is dropped first */
const CACHE_SIZE = 300;

interface CachedImage {
  body: ArrayBuffer;
  type: string;
}

const cache = new Map<string, CachedImage>();
let generation = 0;

/** Drop cached image bytes and prevent pending downloads from repopulating the cleared cache */
export function clearRemoteImageCache(): void {
  generation++;
  cache.clear();
}

/** Register the scheme as secure and standard; must run before the app is ready */
export function registerRemoteImageScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: REMOTE_IMAGE_SCHEME, privileges: { standard: true, secure: true } }]);
}

/** Response for a request the proxy refuses or cannot serve */
function failed(status: number): Response {
  return new Response(null, { status });
}

/** Download an image without cookies, refusing redirects, non-images and oversized bodies */
async function download(url: string): Promise<CachedImage | null> {
  try {
    const response = await fetch(url, {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const type = response.headers.get("content-type") ?? "";
    const length = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || !type.startsWith("image/") || length > MAX_BYTES) {
      return null;
    }
    const body = await response.arrayBuffer();
    return body.byteLength > MAX_BYTES ? null : { body, type };
  } catch {
    return null;
  }
}

/**
 * Serve glaze-image://remote/?u=<url> for app windows. Only https NetEase image hosts are fetched,
 * never with cookies, so the renderer's CSP can stay closed to remote origins
 */
export function handleRemoteImages(): void {
  protocol.handle(REMOTE_IMAGE_SCHEME, async (request) => {
    const target = new URL(request.url).searchParams.get("u");
    if (!target || !isNeteaseImageUrl(target)) {
      return failed(403);
    }
    let image = cache.get(target) ?? null;
    if (!image) {
      const expected = generation;
      image = await download(target);
      if (!image) {
        return failed(502);
      }
      if (generation === expected) cache.set(target, image);
      if (cache.size > CACHE_SIZE) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          cache.delete(oldest);
        }
      }
    }
    return new Response(image.body, {
      headers: { "Content-Type": image.type, "Cache-Control": "max-age=86400" },
    });
  });
}
