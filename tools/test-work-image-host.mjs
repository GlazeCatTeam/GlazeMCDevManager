import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "node_modules/.cache/work-image-tests");
await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: resolve(root, "tests/work-image-host.test.ts"),
      formats: ["cjs"],
      fileName: () => "work-image.test.cjs",
    },
    rolldownOptions: { external: (id) => id.startsWith("node:") || id === "electron" },
  },
});
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), [resolve(output, "work-image.test.cjs")], {
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
