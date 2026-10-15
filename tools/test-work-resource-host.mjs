import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "node_modules/.cache/work-resource-tests");
for (const [entry, name] of [
  ["tests/work-resource-host.test.ts", "host.cjs"],
  ["apps/desktop/src/preload/index.ts", "preload.cjs"],
]) {
  await build({
    configFile: false,
    root,
    logLevel: "warn",
    build: {
      outDir: output,
      emptyOutDir: false,
      minify: false,
      lib: { entry: resolve(root, entry), formats: ["cjs"], fileName: () => name },
      rolldownOptions: { external: (id) => id.startsWith("node:") || id === "electron" },
    },
  });
}
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [resolve(output, "host.cjs"), resolve(output, "preload.cjs")], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
