import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/desktop/node_modules/vite/dist/node/index.js";

// Exercise real SQLite preferences and session handling with synthetic credentials and offline responses
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "node_modules/.cache/session-settings-tests");
await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: resolve(root, "tests/session-settings.test.ts"),
      formats: ["es"],
      fileName: () => "session-settings.test.mjs",
    },
    rolldownOptions: { external: (id) => id.startsWith("node:") },
  },
});
const result = spawnSync(process.execPath, ["--test", resolve(output, "session-settings.test.mjs")], {
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
