// Remote images (avatars, work icons) reach the renderer only through the main process's proxy
// scheme; the page itself never loads remote URLs. See docs/adr/0011-remote-image-proxy.md

export const REMOTE_IMAGE_SCHEME = "glaze-image";

/** Proxy URL for a NetEase image, or null when there is none; the main process checks the host */
export function remoteImageUrl(url: string | null | undefined): string | null {
  return url ? `${REMOTE_IMAGE_SCHEME}://remote/?u=${encodeURIComponent(url)}` : null;
}
