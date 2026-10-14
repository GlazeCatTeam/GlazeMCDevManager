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
    plugins: [react()],
  },
});
