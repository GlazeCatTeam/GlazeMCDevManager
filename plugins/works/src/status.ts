import type { WorkStatus } from "@glaze/plugin-sdk";

// Labels for work statuses and the actions each status allows, mirroring MCDevManager's 上架管理

export type WorkAction =
  | "submitReview"
  | "submitSelfTest"
  | "cancelReview"
  | "publish"
  | "update"
  | "cancelTest"
  | "viewFeedback"
  | "appointOnline"
  | "delete";

/** Color group of a status; colors carry meaning only */
export type StatusTone = "online" | "progress" | "rejected" | "offline" | "neutral";

export const statusLabels: Record<WorkStatus, string> = {
  online: "已上架",
  init: "待提交审核",
  preparing: "系统准备中",
  reviewing: "审核中",
  self_test: "自测中",
  self_test_prepare: "自测准备中",
  reject: "审核未通过",
  accept: "待上架",
  online_preparing: "系统准备中",
  offline: "已下架",
  system_offline: "系统下架",
  unknown: "未知",
};

export const statusTones: Record<WorkStatus, StatusTone> = {
  online: "online",
  init: "progress",
  preparing: "neutral",
  reviewing: "progress",
  self_test: "progress",
  self_test_prepare: "neutral",
  reject: "rejected",
  accept: "progress",
  online_preparing: "neutral",
  offline: "offline",
  system_offline: "offline",
  unknown: "neutral",
};

export const actionLabels: Record<WorkAction, string> = {
  submitReview: "提交审核",
  submitSelfTest: "提交自测",
  cancelReview: "取消审核",
  publish: "上架",
  update: "更新",
  cancelTest: "取消自测",
  viewFeedback: "查看反馈",
  appointOnline: "定时上架",
  delete: "删除",
};

/** Actions that only read; every other action changes the work on the platform */
export const readActions: ReadonlySet<WorkAction> = new Set<WorkAction>(["viewFeedback"]);

/** Actions available for a work in this status; viewing details is always available separately */
export function actionsFor(status: WorkStatus): WorkAction[] {
  switch (status) {
    case "online":
    case "reject":
    case "offline":
    case "system_offline":
      return ["update", "viewFeedback"];
    case "init":
      return ["submitReview", "submitSelfTest", "update", "delete"];
    case "preparing":
    case "reviewing":
      return ["cancelReview"];
    case "accept":
      return ["publish", "appointOnline"];
    case "self_test":
    case "self_test_prepare":
      return ["cancelTest"];
    default:
      return [];
  }
}
