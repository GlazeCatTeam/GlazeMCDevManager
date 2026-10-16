import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Run the built desktop app against an isolated userData directory and its real preload/RPC
const { _electron: electron } = await import(process.argv[2] ?? "playwright");
const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "glaze-electron-appearance-"));
const entry = join(directory, "launch.cjs");
const main = new URL("../apps/desktop/out/main/index.js", import.meta.url).href;
writeFileSync(
  entry,
  `const { app } = require('electron');
app.setPath('userData', ${JSON.stringify(directory)});
app.on('browser-window-created', (_event, window) => { window.show = () => {}; });
import(${JSON.stringify(main)});
`,
);
let application;
try {
  /** Launch a fresh desktop process without using the user's actual profile */
  const launch = async () => {
    const instance = await electron.launch({
      executablePath: require("electron"),
      args: [entry],
      cwd: fileURLToPath(new URL("../", import.meta.url)),
    });
    const page = await instance.firstWindow();
    await page.waitForFunction(() => window.glaze && document.querySelector("button"));
    return { instance, page };
  };
  let opened = await launch();
  application = opened.instance;
  let page = opened.page;
  assert.equal(
    (
      await page.evaluate(() =>
        window.glaze.rpc("appearance.set", { themeId: "fluent-dark", colorMode: "dark", scale: 125 }),
      )
    ).ok,
    true,
  );
  assert.equal((await page.evaluate(() => window.glaze.rpc("layout.setRanking", ["pe_download"]))).ok, true);
  assert.equal(
    (
      await page.evaluate(() =>
        window.glaze.rpc("appearance.set", { themeId: "fluent-dark", colorMode: "light", scale: 125 }),
      )
    ).ok,
    false,
  );
  await application.close();
  opened = await launch();
  application = opened.instance;
  page = opened.page;
  assert.deepEqual(await page.evaluate(() => window.glaze.rpc("appearance.get")), {
    ok: true,
    value: { themeId: "fluent-dark", colorMode: "dark", scale: 125 },
  });
  assert.equal(await page.evaluate(() => document.documentElement.style.zoom), "1.25");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "glaze.theme.fluent-dark");
  assert.deepEqual(await page.evaluate(() => window.glaze.rpc("layout.getRanking")), {
    ok: true,
    value: ["pe_download"],
  });
  assert.equal((await page.evaluate(() => window.glaze.rpc("layout.reset"))).ok, true);
  assert.deepEqual(await page.evaluate(() => window.glaze.rpc("layout.getRanking")), {
    ok: true,
    value: ["pe_hot", "hot_search", "pe_download", "pe_sell"],
  });
  assert.equal((await page.evaluate(() => window.glaze.rpc("appearance.get"))).value.scale, 125);
  console.log("PASS: real Electron preload/RPC, validation, process restart restoration and layout reset isolation");
} finally {
  await application?.close();
  rmSync(directory, { recursive: true, force: true });
}
