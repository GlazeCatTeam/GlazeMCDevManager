import { spawn } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../apps/desktop/node_modules/vite/dist/node/index.js";

// Run every offline regression in tests/ with Node's test runner; `pnpm test mcp rank` runs a subset
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "node_modules/.cache/glaze-tests");
const filters = process.argv.slice(2);

// Tests that need Electron's main process, with extra entries bundled beside them and passed as arguments
const electronTests = {
  "work-image-host": [],
  "work-resource-host": ["apps/desktop/src/preload/index.ts"],
};

const files = readdirSync(resolve(root, "tests")).filter((file) => file.endsWith(".test.ts"));
// A test file imported by another one already runs as part of it
const imported = new Set(
  files.flatMap((file) =>
    [...readFileSync(resolve(root, "tests", file), "utf8").matchAll(/^import "\.\/(.+\.test)";$/gm)].map(
      (match) => `${match[1]}.ts`,
    ),
  ),
);
const names = files
  .filter((file) => !imported.has(file))
  .map((file) => file.slice(0, -".test.ts".length))
  .filter((name) => filters.length === 0 || filters.includes(name))
  .sort();
const unknown = filters.filter((name) => !names.includes(name));
if (unknown.length > 0) {
  console.error(`未找到测试：${unknown.join("、")}`);
  process.exit(1);
}

/** Bundle sources with the desktop app's Vite so tests import TypeScript exactly as the app does */
async function bundle(entries, format, extension) {
  await build({
    configFile: false,
    root,
    logLevel: "warn",
    build: {
      outDir: output,
      emptyOutDir: false,
      minify: false,
      lib: { entry: entries, formats: [format], fileName: (_, name) => `${name}${extension}` },
      rolldownOptions: { external: (id) => id.startsWith("node:") || id === "electron" },
    },
  });
}

/** Run a child process with inherited output and resolve its exit code */
function run(command, args, env = process.env) {
  return new Promise((done) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
    child.on("error", (error) => {
      console.error(error);
      done(1);
    });
    child.on("exit", (code) => done(code ?? 1));
  });
}

rmSync(output, { recursive: true, force: true });
const failed = [];
const nodeTests = names.filter((name) => !(name in electronTests));
if (nodeTests.length > 0) {
  await bundle(
    Object.fromEntries(nodeTests.map((name) => [name, resolve(root, `tests/${name}.test.ts`)])),
    "es",
    ".test.mjs",
  );
  const code = await run(process.execPath, ["--test", ...nodeTests.map((name) => resolve(output, `${name}.test.mjs`))]);
  if (code !== 0) failed.push("Node 测试");
}

const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const electronEnv = { ...process.env };
delete electronEnv.ELECTRON_RUN_AS_NODE;
for (const name of names.filter((name) => name in electronTests)) {
  const extras = electronTests[name].map((entry, index) => [`${name}.extra${index}`, resolve(root, entry)]);
  // Bundle separately so a sandboxed preload never depends on a shared chunk
  for (const [file, entry] of [[name, resolve(root, `tests/${name}.test.ts`)], ...extras]) {
    await bundle({ [file]: entry }, "cjs", ".cjs");
  }
  console.log(`\n▶ Electron：${name}`);
  const args = [name, ...extras.map(([extra]) => extra)].map((file) => resolve(output, `${file}.cjs`));
  if ((await run(require("electron"), args, electronEnv)) !== 0) failed.push(name);
}

if (failed.length > 0) {
  console.error(`\n✖ 测试未通过：${failed.join("、")}`);
  process.exitCode = 1;
} else {
  console.log(
    `\n✔ 全部通过：${nodeTests.length} 个 Node 测试文件，${names.length - nodeTests.length} 个 Electron 宿主测试`,
  );
}
