import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/desktop/node_modules/vite/dist/node/index.js";

// Bundle adapter and UI date helpers for isolated offline regression checks
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "node_modules/.cache/comments-tests");
await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: { entry: resolve(root, "tests/comments.test.ts"), formats: ["es"], fileName: () => "comments.test.mjs" },
    rolldownOptions: { external: (id) => id.startsWith("node:") },
  },
});
const result = spawnSync(process.execPath, ["--test", resolve(output, "comments.test.mjs")], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
