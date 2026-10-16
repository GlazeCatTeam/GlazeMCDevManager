import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { collectLicenseNotices } from "./build/license-notices";
import pkg from "./package.json";

// Workspace packages ship TypeScript sources, so they must be bundled rather than required at runtime
const workspacePackages = Object.keys(pkg.dependencies).filter((name) => name.startsWith("@glaze/"));
const projectLicense = readFileSync(resolve(import.meta.dirname, "../../LICENSE"), "utf8");
const projectNotice = readFileSync(resolve(import.meta.dirname, "../../NOTICE"), "utf8");

export default defineConfig({
  main: {
    define: {
      __GLAZE_DEPENDENCY_LICENSES__: JSON.stringify(collectLicenseNotices(import.meta.dirname)),
      __GLAZE_PROJECT_LICENSE_TEXT__: JSON.stringify(projectLicense),
      __GLAZE_PROJECT_NOTICE__: JSON.stringify(projectNotice),
    },
    plugins: [
      {
        name: "project-license-files",
        /** Preserve readable license files beside the bundled main process for redistribution */
        generateBundle() {
          this.emitFile({ type: "asset", fileName: "LICENSE", source: projectLicense });
          this.emitFile({ type: "asset", fileName: "NOTICE", source: projectNotice });
        },
      },
    ],
    build: {
      externalizeDeps: { exclude: workspacePackages },
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, "src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      // Sandboxed preload scripts cannot require node_modules and must be CommonJS
      externalizeDeps: false,
      rolldownOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    plugins: [
      react(),
      {
        name: "watch-workspace-source",
        // These source packages sit outside the renderer root. Watching directories
        // also catches new files, so previously missing imports can recover via HMR.
        configureServer(server) {
          server.watcher.add(
            ["plugins", "packages", "themes"].map((directory) => resolve(import.meta.dirname, "../..", directory)),
          );
        },
      },
    ],
  },
});
