import {
  isBannerSave,
  isPromotionId,
  isPromotionJoin,
  isPromotionModule,
  isPromotionPage,
  type RpcMethods,
} from "@glaze/contracts";
import {
  cancelPromotionDiscount,
  getPromotionActivities,
  getPromotionApplications,
  getPromotionDates,
  getPromotionDiscount,
  getPromotionModule,
  joinPromotion,
  savePromotionBanner,
} from "@glaze/netease";
import { BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { SessionManager } from "../session/session-manager";
import { CapabilityError } from "./errors";
import { pickAndUploadWorkFile } from "./work-files";
import { discardWorkImage, prepareWorkImage, uploadCroppedWorkImage } from "./work-image";

type PromotionMethod = Extract<keyof RpcMethods, `promotion.${string}`>;
type Handlers = {
  [M in PromotionMethod]: (
    params: RpcMethods[M]["params"],
    event: IpcMainInvokeEvent,
  ) => Promise<RpcMethods[M]["result"]>;
};

/** Verify account context before a user-requested mutation */
function writeAccount(sessions: SessionManager, value: unknown): asserts value is { account: string } {
  const account = (value as { account?: unknown } | null)?.account;
  if (typeof account !== "string" || sessions.current()?.id !== account)
    throw new CapabilityError("account_changed", "账号已切换，请重新打开活动推广");
}

/** Accept optional account IDs only for read operations */
function readAccount(value: unknown): string | undefined {
  const account = (value as { account?: unknown } | null)?.account;
  if (account !== undefined && (typeof account !== "string" || !account))
    throw new CapabilityError("validation", "账号参数无效");
  return account as string | undefined;
}

/** Keep promotion capabilities grouped with runtime validation at the IPC boundary */
export function createPromotionHandlers(sessions: SessionManager): Handlers {
  return {
    "promotion.prepareImage": async (params, event) => {
      writeAccount(sessions, params);
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new CapabilityError("validation", "找不到图片选择窗口");
      return prepareWorkImage(sessions, window, { account: params.account, kind: "banner" });
    },
    "promotion.uploadImage": async (params, event) => {
      writeAccount(sessions, params);
      if (typeof params.token !== "string" || !params.token) throw new CapabilityError("validation", "图片选择无效");
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new CapabilityError("validation", "找不到图片上传窗口");
      return uploadCroppedWorkImage(sessions, window, params);
    },
    "promotion.discardImage": async (params, event) => {
      writeAccount(sessions, params);
      if (typeof params.token !== "string" || !params.token) throw new CapabilityError("validation", "图片选择无效");
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) discardWorkImage(params.account, params.token, window);
      return undefined;
    },
    "promotion.activities": async (params) => {
      if (!isPromotionPage(params)) throw new CapabilityError("validation", "活动分页参数无效");
      return sessions.request(readAccount(params), (session) => getPromotionActivities(session, params));
    },
    "promotion.discount": async (params) => sessions.request(readAccount(params), getPromotionDiscount),
    "promotion.module": async (params) => {
      if (!isPromotionModule(params)) throw new CapabilityError("validation", "活动赛道参数无效");
      return sessions.request(readAccount(params), (session) => getPromotionModule(session, params));
    },
    "promotion.dates": async (params) => sessions.request(readAccount(params), getPromotionDates),
    "promotion.applications": async (params) => {
      if (!isPromotionPage(params)) throw new CapabilityError("validation", "申请分页参数无效");
      return sessions.request(readAccount(params), (session) => getPromotionApplications(session, params));
    },
    "promotion.join": async (params) => {
      if (!isPromotionJoin(params)) throw new CapabilityError("validation", "报名参数无效");
      writeAccount(sessions, params);
      return sessions.request(params.account, (session) => joinPromotion(session, params));
    },
    "promotion.cancelDiscount": async (params) => {
      writeAccount(sessions, params);
      if (!isPromotionId(params.activityId) || !isPromotionId(params.itemId))
        throw new CapabilityError("validation", "取消报名参数无效");
      return sessions.request(params.account, (session) => cancelPromotionDiscount(session, params));
    },
    "promotion.saveBanner": async (params) => {
      if (!isBannerSave(params)) throw new CapabilityError("validation", "轮播图申请参数无效");
      writeAccount(sessions, params);
      return sessions.request(params.account, (session) => savePromotionBanner(session, params));
    },
    "promotion.upload": async (params, event) => {
      writeAccount(sessions, params);
      if (params.kind !== "image" && params.kind !== "video" && params.kind !== "banner")
        throw new CapabilityError("validation", "上传类型无效");
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) throw new CapabilityError("validation", "找不到上传窗口");
      return pickAndUploadWorkFile(sessions, window, {
        account: params.account,
        kind: params.kind === "image" ? "richImage" : params.kind,
      });
    },
  };
}
