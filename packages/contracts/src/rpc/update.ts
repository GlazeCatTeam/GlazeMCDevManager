/**
 * - unsupported: development build or portable copy, which cannot update itself
 * - idle: nothing checked yet in this run
 * - latest: the last check found no newer release
 * - downloaded: the update is ready and installs when the app restarts
 */
export type UpdatePhase = "unsupported" | "idle" | "checking" | "latest" | "downloading" | "downloaded" | "error";

export interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  /** Newer release found by the last check, null when none */
  latestVersion: string | null;
  /** Plain-text release notes of latestVersion */
  releaseNotes: string | null;
  /** Download progress 0–1 while downloading */
  progress: number | null;
  /** User-facing reason for the last failure */
  error: string | null;
  /** ISO time of the last finished check */
  checkedAt: string | null;
  /** Check on startup and every few hours; downloads in the background */
  autoCheck: boolean;
}

export const defaultUpdateAutoCheck = true;
