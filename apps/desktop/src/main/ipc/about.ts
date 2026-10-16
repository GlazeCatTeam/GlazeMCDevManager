import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AboutInfo, DependencyLicense } from "@glaze/contracts";
import { app, shell } from "electron";
import packageInfo from "../../../package.json";
import { CapabilityError } from "./errors";

declare const __GLAZE_DEPENDENCY_LICENSES__: DependencyLicense[];
declare const __GLAZE_PROJECT_LICENSE_TEXT__: string;
declare const __GLAZE_PROJECT_NOTICE__: string;

const projectLinks = {
  homepage: "https://github.com/GlazeCatTeam/GlazeMCDevManager",
  feedback: "https://github.com/GlazeCatTeam/GlazeMCDevManager/issues",
  reference: "https://github.com/BitterLemonn/MCDevManager",
} as const;

/** Read the packaged app version or the desktop manifest in development, never Electron's app version */
export function getAboutInfo(): AboutInfo {
  return {
    name: "Glaze MC Dev Manager",
    version: app.isPackaged ? app.getVersion() : packageInfo.version,
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    projectLicense: {
      id: packageInfo.license,
      name: "Apache License 2.0",
      summary: "原创代码与文档采用 Apache-2.0；第三方依赖与资源遵循各自声明。",
      text: __GLAZE_PROJECT_LICENSE_TEXT__,
      notice: __GLAZE_PROJECT_NOTICE__,
    },
  };
}

/** Return notices embedded during the build so this page also works offline and inside an archive */
export function getDependencyLicenses(): DependencyLicense[] {
  return __GLAZE_DEPENDENCY_LICENSES__;
}

/** Accept only fixed project destinations; renderer-provided URLs never reach the operating system */
export async function openProjectLink(link: unknown): Promise<undefined> {
  if (link !== "homepage" && link !== "feedback" && link !== "reference") {
    throw new CapabilityError("validation", "项目链接无效");
  }
  try {
    await shell.openExternal(projectLinks[link]);
  } catch {
    throw new CapabilityError("internal", "无法打开默认浏览器，请检查系统浏览器设置后重试");
  }
}

/** Open only the runtime's bundled notice file, without accepting a renderer path */
export async function openRuntimeNotices(): Promise<undefined> {
  const path = join(dirname(process.execPath), "LICENSES.chromium.html");
  try {
    await access(path);
    const error = await shell.openPath(path);
    if (error) throw new Error(error);
  } catch {
    throw new CapabilityError(
      "internal",
      "无法打开运行时许可声明，请确认应用目录中包含 LICENSES.chromium.html 且已设置默认浏览器",
    );
  }
}
