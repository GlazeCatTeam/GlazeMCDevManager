import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Run Playwright UI regressions one by one: browser pages by default, built Electron app with --electron
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const channel = args.find((arg) => arg.startsWith("--channel="))?.slice("--channel=".length) ?? "msedge";
const filters = args.filter((arg) => !arg.startsWith("--"));
const suffixes = args.includes("--electron") ? ["-ui.mjs", "-electron.mjs"] : ["-ui.mjs"];
const scripts = readdirSync(new URL("./", import.meta.url))
  .filter((file) => file.startsWith("test-") && suffixes.some((suffix) => file.endsWith(suffix)))
  .filter((file) => filters.length === 0 || filters.some((filter) => file.includes(filter)))
  .sort();
if (scripts.length === 0) {
  console.error("没有匹配的界面回归脚本");
  process.exit(1);
}

/** Run one regression script with the shared Playwright module and browser channel */
function run(script) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [`tools/${script}`, "playwright", channel], {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", (error) => {
      console.error(error);
      done(1);
    });
    child.on("exit", (code) => done(code ?? 1));
  });
}

const failed = [];
for (const script of scripts) {
  console.log(`\n▶ ${script}`);
  if ((await run(script)) !== 0) failed.push(script);
}
if (failed.length > 0) {
  console.error(`\n✖ ${failed.length}/${scripts.length} 个界面回归未通过：${failed.join("、")}`);
  process.exitCode = 1;
} else {
  console.log(`\n✔ ${scripts.length} 个界面回归全部通过（浏览器通道 ${channel}）`);
}
