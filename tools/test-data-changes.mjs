import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/desktop/node_modules/vite/dist/node/index.js";

// Bundle and run the data-change broadcast and cache refresh regressions
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "node_modules/.cache/data-changes-tests");
await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: resolve(root, "tests/data-changes.test.ts"),
      formats: ["es"],
      fileName: () => "data-changes.test.mjs",
    },
    rolldownOptions: { external: (id) => id.startsWith("node:") },
  },
});
const result = spawnSync(process.execPath, ["--test", resolve(output, "data-changes.test.mjs")], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
