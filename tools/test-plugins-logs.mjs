import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "node_modules/.cache/plugins-logs-tests");
// Bundle production validators and services; fixtures never access real user data or Windows startup settings
await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: resolve(root, "tests/plugins-logs.test.ts"),
      formats: ["es"],
      fileName: () => "plugins-logs.test.mjs",
    },
    rolldownOptions: { external: (id) => id.startsWith("node:") },
  },
});
const result = spawnSync(process.execPath, ["--test", resolve(output, "plugins-logs.test.mjs")], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
