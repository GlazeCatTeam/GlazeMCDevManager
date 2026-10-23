export const REMOTE_VIDEO_SCHEME = "glaze-video";

/** Stream platform videos through the host without exposing session credentials */
export function remoteVideoUrl(url: string | null | undefined): string | null {
  return url ? `${REMOTE_VIDEO_SCHEME}://remote/?u=${encodeURIComponent(url)}` : null;
}
