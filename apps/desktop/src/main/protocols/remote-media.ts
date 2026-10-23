import { REMOTE_IMAGE_SCHEME, REMOTE_VIDEO_SCHEME } from "@glaze/contracts";
import { protocol } from "electron";

/** Electron requires all privileged schemes in one call before app readiness */
export function registerRemoteMediaSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: REMOTE_IMAGE_SCHEME, privileges: { standard: true, secure: true } },
    { scheme: REMOTE_VIDEO_SCHEME, privileges: { standard: true, secure: true, stream: true } },
  ]);
}
