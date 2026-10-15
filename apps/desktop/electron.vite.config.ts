import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import pkg from "./package.json";

// Workspace packages ship TypeScript sources, so they must be bundled rather than required at runtime
const workspacePackages = Object.keys(pkg.dependencies).filter((name) => name.startsWith("@glaze/"));

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: workspacePackages },
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
