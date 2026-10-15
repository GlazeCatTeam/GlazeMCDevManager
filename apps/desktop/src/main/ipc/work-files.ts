import { openAsBlob } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { WorkUpload, WorkUploadParams } from "@glaze/contracts";
import { getWorkEditorOptions, uploadWorkFile } from "@glaze/netease";
import { type BrowserWindow, dialog, nativeImage } from "electron";
import type { SessionManager } from "../session/session-manager";
import { CapabilityError } from "./errors";
import { validateWorkVideo } from "./work-video";

/** Only a native picker can supply the upload path; renderer paths are never accepted */
export async function pickAndUploadWorkFile(
  sessions: SessionManager,
  window: BrowserWindow,
  params: WorkUploadParams,
): Promise<WorkUpload | null> {
  const account = params.account;
  if (!account || sessions.current()?.id !== account)
    throw new CapabilityError("account_changed", "账号已切换，请重新打开作品");
  const resource = params.kind === "resource";
  const video = params.kind === "video";
  const extensions = resource ? ["zip"] : video ? ["mp4"] : ["png", "jpg", "jpeg"];
  const picked = await dialog.showOpenDialog(window, {
    title: resource ? "选择模组资源包" : video ? "选择作品视频" : "选择作品图片",
    properties: ["openFile"],
    filters: [{ name: resource ? "资源包" : video ? "视频" : "图片", extensions }],
  });
  const path = picked.filePaths[0];
  if (picked.canceled || !path) return null;
  if (sessions.current()?.id !== account) throw new CapabilityError("account_changed", "账号已切换，已取消上传");
  const info = await stat(path);
  const limit = (resource ? 2048 : video ? 50 : 10) * 1024 * 1024;
  const extension = extname(path).slice(1).toLowerCase();
  if (!info.isFile() || info.size <= 0 || info.size > limit || !extensions.includes(extension))
    throw new CapabilityError("validation", `请选择有效文件，大小不能超过 ${limit / 1024 / 1024}M`);
  if (video) {
    try {
      validateWorkVideo(await readFile(path));
    } catch (error) {
      throw new CapabilityError("validation", error instanceof Error ? error.message : "视频格式无效");
    }
  } else if (!resource) {
    let expected: { width: number; height: number } | undefined;
    if (params.kind === "banner") expected = { width: 940, height: 450 };
    if (params.kind === "videoCover") expected = { width: 992, height: 558 };
    if (params.kind === "image") {
      const options = await sessions.request(account, getWorkEditorOptions);
      expected = (params.platform === "pc" ? options.pcImages : options.peImages).find(
        (slot) => slot.id === params.channelId,
      );
      if (!expected) throw new CapabilityError("validation", "图片位不存在，请刷新平台配置");
    }
    const image = nativeImage.createFromPath(path);
    const dimensions = image.getSize();
    if (image.isEmpty() || (expected && (dimensions.width !== expected.width || dimensions.height !== expected.height)))
      throw new CapabilityError(
        "validation",
        expected ? `图片须为 ${expected.width} × ${expected.height}` : "无法读取图片",
      );
  }
  if (sessions.current()?.id !== account) throw new CapabilityError("account_changed", "账号已切换，已取消上传");
  const type = resource ? "application/zip" : video ? "video/mp4" : extension === "png" ? "image/png" : "image/jpeg";
  const blob = await openAsBlob(path, { type });
  return sessions.request(account, (session) =>
    uploadWorkFile(session, blob, basename(path), resource ? "zip_package" : video ? "video" : "image"),
  );
}
