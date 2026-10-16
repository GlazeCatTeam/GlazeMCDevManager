import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "node_modules/.cache/mcp-tests");
const tests = readdirSync(resolve(root, "tests"))
  .filter((file) => /^mcp(?:-.*)?\.test\.ts$/.test(file))
  .sort();
await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: Object.fromEntries(tests.map((file) => [file.slice(0, -3), resolve(root, "tests", file)])),
      formats: ["es"],
      fileName: (_, name) => `${name}.mjs`,
    },
    rolldownOptions: { external: (id) => id.startsWith("node:") },
  },
});
const result = spawnSync(
  process.execPath,
  ["--test", ...tests.map((file) => resolve(output, `${file.slice(0, -3)}.mjs`))],
  {
    stdio: "inherit",
    windowsHide: true,
  },
);
process.exitCode = result.status ?? 1;
