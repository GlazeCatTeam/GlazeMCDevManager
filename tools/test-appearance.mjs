import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/desktop/node_modules/vite/dist/node/index.js";

// Exercise production persistence and migrations using isolated SQLite databases
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "node_modules/.cache/appearance-tests");
await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: { entry: resolve(root, "tests/appearance.test.ts"), formats: ["es"], fileName: () => "appearance.test.mjs" },
    rolldownOptions: { external: (id) => id.startsWith("node:") },
  },
});
const result = spawnSync(process.execPath, ["--test", resolve(output, "appearance.test.mjs")], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
