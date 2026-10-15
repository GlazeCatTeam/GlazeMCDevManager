import { readFile, stat, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import type { LogQuery } from "@glaze/contracts";
import { type BrowserWindow, dialog, shell } from "electron";
import { ensureOwnedDirectory } from "../files/owned-directory";
import type { LogService } from "../logs/service";
import type { PluginRegistry } from "../plugins/registry";

/** Only a native file selection can supply the plugin archive path */
export async function pickPlugin(window: BrowserWindow, plugins: PluginRegistry) {
  const picked = await dialog.showOpenDialog(window, {
    title: "选择本地主题插件",
    properties: ["openFile"],
    filters: [{ name: "Glaze 主题插件", extensions: ["glazeplugin", "zip"] }],
  });
  const path = picked.filePaths[0];
  if (picked.canceled || !path) return null;
  const info = await stat(path);
  if (!info.isFile() || info.size > 2 * 1024 * 1024 || ![".glazeplugin", ".zip"].includes(extname(path).toLowerCase()))
    throw new Error("请选择不超过 2 MB 的 .glazeplugin 或 ZIP 主题包");
  return plugins.preview(await readFile(path));
}

/** Export redacted visible records using a native save dialog, with explicit cancellation */
export async function exportLogs(window: BrowserWindow, logs: LogService, query: LogQuery) {
  const snapshot = logs.export(query);
  const picked = await dialog.showSaveDialog(window, {
    title: "导出运行日志",
    defaultPath: `glaze-logs-${new Date().toISOString().slice(0, 10)}.txt`,
    filters: [{ name: "文本文件", extensions: ["txt"] }],
  });
  if (picked.canceled || !picked.filePath) return { cancelled: true, count: 0 };
  await writeFile(picked.filePath, snapshot.text, "utf8");
  return { cancelled: false, count: snapshot.count };
}

/** Open the application's log directory and surface shell failures */
export async function openLogs(logs: LogService): Promise<void> {
  ensureOwnedDirectory(logs.directory);
  const error = await shell.openPath(logs.directory);
  if (error) throw new Error("无法打开日志文件夹");
}
