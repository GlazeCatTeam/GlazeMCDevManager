import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { validWorkCrop, type WorkCropParams, type WorkImageDraft, type WorkImageParams } from "@glaze/contracts";
import { getWorkEditorOptions, uploadWorkFile } from "@glaze/netease";
import { type BrowserWindow, dialog, type NativeImage, nativeImage } from "electron";
import type { SessionManager } from "../session/session-manager";
import { CapabilityError } from "./errors";

interface Draft {
  account: string;
  owner: number;
  expires: number;
  image: NativeImage;
  name: string;
  targetWidth: number;
  targetHeight: number;
}
const drafts = new Map<string, Draft>();

/** Resolve only the image snapshot chosen by this account and window */
function ownedDraft(account: string, token: string, owner: number): Draft {
  const draft = drafts.get(token);
  if (!draft || draft.account !== account || draft.owner !== owner || draft.expires < Date.now())
    throw new CapabilityError("validation", "图片选择已失效，请重新选择");
  return draft;
}

/** Pick an immutable image snapshot; preview is bounded and no local path reaches the renderer */
export async function prepareWorkImage(
  sessions: SessionManager,
  window: BrowserWindow,
  params: WorkImageParams,
): Promise<WorkImageDraft | null> {
  if (sessions.current()?.id !== params.account)
    throw new CapabilityError("account_changed", "账号已切换，请重新选择图片");
  for (const [token, draft] of drafts)
    if (draft.expires < Date.now() || draft.owner === window.webContents.id) drafts.delete(token);
  const picked = await dialog.showOpenDialog(window, {
    title: "选择并裁剪作品图片",
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg"] }],
  });
  const path = picked.filePaths[0];
  if (picked.canceled || !path) return null;
  const file = await stat(path);
  if (
    !file.isFile() ||
    file.size <= 0 ||
    file.size > 10 * 1024 * 1024 ||
    ![".png", ".jpg", ".jpeg"].includes(extname(path).toLowerCase())
  )
    throw new CapabilityError("validation", "请选择不超过 10M 的 PNG/JPG 图片");
  const bytes = await readFile(path);
  if (bytes.length > 10 * 1024 * 1024) throw new CapabilityError("validation", "图片超过 10M");
  const image = nativeImage.createFromBuffer(bytes);
  const { width, height } = image.getSize();
  if (image.isEmpty() || width > 10000 || height > 10000 || width * height > 36_000_000)
    throw new CapabilityError("validation", "图片无效或超过 3600 万像素");
  let targetWidth = width,
    targetHeight = height;
  if (params.kind === "banner") {
    targetWidth = 940;
    targetHeight = 450;
  }
  if (params.kind === "videoCover") {
    targetWidth = 992;
    targetHeight = 558;
  }
  if (params.kind === "image") {
    const options = await sessions.request(params.account, getWorkEditorOptions);
    const slot = (params.platform === "pc" ? options.pcImages : options.peImages).find(
      (s) => s.id === params.channelId,
    );
    if (
      !slot ||
      slot.width <= 0 ||
      slot.height <= 0 ||
      slot.width > 10000 ||
      slot.height > 10000 ||
      slot.width * slot.height > 36_000_000
    )
      throw new CapabilityError("validation", "图片位不存在或尺寸不受支持，请刷新选项");
    targetWidth = slot.width;
    targetHeight = slot.height;
  }
  if (sessions.current()?.id !== params.account || window.isDestroyed())
    throw new CapabilityError("account_changed", "账号或窗口已变化，已取消图片选择");
  if (drafts.size >= 8) drafts.delete(drafts.keys().next().value as string);
  const token = randomUUID();
  drafts.set(token, {
    account: params.account,
    owner: window.webContents.id,
    expires: Date.now() + 5 * 60_000,
    image,
    name: `${basename(path, extname(path))}.png`,
    targetWidth,
    targetHeight,
  });
  setTimeout(() => drafts.delete(token), 5 * 60_000).unref();
  const preview = image
    .resize({
      ...(width >= height ? { width: Math.min(width, 900) } : { height: Math.min(height, 900) }),
      quality: "good",
    })
    .toPNG()
    .toString("base64");
  return { token, preview, width, height, targetWidth, targetHeight };
}

/** Crop and encode the host snapshot, then upload once after explicit confirmation */
export async function uploadCroppedWorkImage(sessions: SessionManager, window: BrowserWindow, params: WorkCropParams) {
  const draft = ownedDraft(params.account, params.token, window.webContents.id);
  if (sessions.current()?.id !== params.account) throw new CapabilityError("account_changed", "账号已切换，已取消上传");
  const size = draft.image.getSize();
  if (!validWorkCrop(params.crop, size.width, size.height, draft.targetWidth, draft.targetHeight))
    throw new CapabilityError("validation", "裁剪区域无效，请重新选择");
  const png = draft.image
    .crop(params.crop)
    .resize({ width: draft.targetWidth, height: draft.targetHeight, quality: "best" })
    .toPNG();
  if (!png.length || png.length > 10 * 1024 * 1024)
    throw new CapabilityError("validation", "裁剪后图片超过 10M，请选择其他图片");
  drafts.delete(params.token);
  return sessions.request(params.account, (session) =>
    uploadWorkFile(session, new Blob([new Uint8Array(png)], { type: "image/png" }), draft.name, "image"),
  );
}

/** Discard only the requesting window's local snapshot without an external request */
export function discardWorkImage(account: string, token: string, window: BrowserWindow): void {
  const draft = drafts.get(token);
  if (draft?.account === account && draft.owner === window.webContents.id) drafts.delete(token);
}
