import { REMOTE_VIDEO_SCHEME } from "@glaze/contracts";
import { isNeteaseImageUrl } from "@glaze/netease";
import { protocol } from "electron";

const MAX_BYTES = 50 * 1024 * 1024;

/** Forward byte ranges without cookies or buffering entire videos in memory */
export async function serveRemoteVideo(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("u");
  if (url.hostname !== "remote" || !target || !isNeteaseImageUrl(target)) return new Response(null, { status: 403 });
  const source = new URL(target);
  if (source.username || source.password || (source.port && source.port !== "443"))
    return new Response(null, { status: 403 });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
  const headers = new Headers();
  const range = request.headers.get("Range");
  if (range) {
    if (!/^bytes=\d*-\d*$/.test(range) || range === "bytes=-") return new Response(null, { status: 416 });
    headers.set("Range", range);
  }
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
    });
    const type = response.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const length = Number(response.headers.get("Content-Length") ?? 0);
    if (!response.ok || (!type.startsWith("video/") && type !== "application/octet-stream") || length > MAX_BYTES) {
      await response.body?.cancel();
      return new Response(null, { status: response.status === 416 ? 416 : 502 });
    }
    const resultHeaders = new Headers({
      "Content-Type": type === "application/octet-stream" ? "video/mp4" : type,
      "Cache-Control": "no-store",
    });
    for (const name of ["Content-Length", "Content-Range", "Accept-Ranges"]) {
      const value = response.headers.get(name);
      if (value) resultHeaders.set(name, value);
    }
    let received = 0;
    const body = response.body?.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          if (received > MAX_BYTES) controller.error(new Error("视频超过预览大小限制"));
          else controller.enqueue(chunk);
        },
      }),
    );
    return new Response(body, { status: response.status, headers: resultHeaders });
  } catch {
    return new Response(null, { status: 502 });
  }
}

/** Only approved HTTPS platform hosts can supply video bytes */
export function handleRemoteVideos(): void {
  protocol.handle(REMOTE_VIDEO_SCHEME, serveRemoteVideo);
}
