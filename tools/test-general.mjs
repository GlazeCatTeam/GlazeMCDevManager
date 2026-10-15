import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/desktop/node_modules/vite/dist/node/index.js";

// Test real preference storage with isolated native and resource-cache adapters
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "node_modules/.cache/general-tests");
await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: { entry: resolve(root, "tests/general.test.ts"), formats: ["es"], fileName: () => "general.test.mjs" },
    rolldownOptions: { external: (id) => id.startsWith("node:") },
  },
});
const result = spawnSync(process.execPath, ["--test", resolve(output, "general.test.mjs")], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
