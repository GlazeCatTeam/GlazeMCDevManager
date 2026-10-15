import type { AccountParams } from "./developer";

// Works (上架管理) capabilities; read-only for now, write actions come later with confirmation

/** Platform status of a mobile (PE) work; values the app does not know map to "unknown" */
export type WorkStatus =
  | "online"
  | "init"
  | "preparing"
  | "reviewing"
  | "self_test"
  | "self_test_prepare"
  | "reject"
  | "accept"
  | "online_preparing"
  | "offline"
  | "system_offline"
  | "unknown";

export type WorkPriceType = "diamond" | "point" | "free";

export interface WorkSummary {
  itemId: string;
  name: string;
  status: WorkStatus;
  price: number;
  priceType: WorkPriceType;
  isOriginal: boolean;
  /** Also published to PC */
  syncPc: boolean;
  /** Free prerequisite (前置) mod */
  isPrerequisite: boolean;
  weakOffline: boolean;
  weakOfflineReason: string | null;
  /** ISO timestamps from the platform */
  createTime: string;
  applyReviewTime: string | null;
}

export interface WorkDetail {
  itemId: string;
  name: string;
  /** Square work icon on the platform's CDN; load it through remoteImageUrl */
  iconUrl: string | null;
  /** Wide banner picture */
  bannerUrl: string | null;
  onlineTime: string | null;
  firstOnlineTime: string | null;
  /** Scheduled go-live time, if one is set */
  appointOnlineTime: string | null;
}

export interface WorkReviewFeedback {
  /** Reviewer's feedback as plain text */
  text: string;
  /** ISO timestamp of the review, if the platform sends one */
  time: string | null;
}

export interface WorkParams extends AccountParams {
  itemId: string;
}

export interface WorkPageParams extends AccountParams {
  /** Zero-based page; the workbench fetches nine rows at a time */
  page: number;
  pageSize: number;
}

export interface WorkPage {
  items: WorkSummary[];
  total: number;
}
