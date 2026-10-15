import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LogService, redactLog } from "../apps/desktop/src/main/logs/service";
import { readPluginZip } from "../apps/desktop/src/main/plugins/archive";
import { PluginRegistry } from "../apps/desktop/src/main/plugins/registry";
import { parseThemeArchive, validateThemePackage } from "../apps/desktop/src/main/plugins/theme-package";
import { AppearanceService } from "../apps/desktop/src/main/preferences/appearance";
import { openDatabase } from "../packages/storage/src/db/database";
import { PreferenceStore } from "../packages/storage/src/db/preferences";
import { themeFixture, zipFiles } from "./fixtures/theme-package.mjs";

/** Run every filesystem test in its own temporary directory */
function workspace(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "glaze-plugins-logs-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("stored and deflated ZIP packages validate without extracting files", () => {
  const fixture = themeFixture();
  assert.equal(parseThemeArchive(fixture.bytes).package.id, "demo.ocean");
  assert.equal(readPluginZip(zipFiles({ "one.json": "{}", "two.json": "{}" })).size, 2);
  assert.throws(() => readPluginZip(zipFiles({ "../escape.json": "{}", "theme.json": "{}" })), /路径/);
  assert.throws(() => readPluginZip(Buffer.alloc(3 * 1024 * 1024)), /大小/);
  assert.throws(() => readPluginZip(fixture.bytes.subarray(0, -1)));
  const damaged = Buffer.from(fixture.bytes);
  damaged[40] = (damaged[40] ?? 0) ^ 255;
  assert.throws(() => parseThemeArchive(damaged));
  assert.throws(
    () =>
      parseThemeArchive(
        zipFiles({
          "glaze-plugin.json": JSON.stringify(fixture.manifest),
          "theme.json": JSON.stringify(fixture.definition),
          "payload.js": "throw 1",
        }),
      ),
    /不支持/,
  );
});

test("theme packages reject code, permissions, reserved IDs, unsafe CSS and expanding reference graphs", () => {
  const { manifest, definition } = themeFixture();
  assert.throws(() => validateThemePackage({ ...manifest, entries: { ui: "evil.js" } }, definition), /无代码/);
  assert.throws(
    () => validateThemePackage({ ...manifest, permissions: ["netease:account.manage"] }, definition),
    /无代码/,
  );
  assert.throws(() => validateThemePackage({ ...manifest, id: "glaze.settings" }, definition), /内置/);
  assert.throws(() => validateThemePackage({ ...manifest, id: "con.test" }, definition), /ID/);
  assert.throws(() => validateThemePackage({ ...manifest, engines: { glaze: "^9.0.0" } }, definition), /兼容/);
  assert.throws(
    () =>
      validateThemePackage(manifest, {
        ...definition,
        tokens: { semantic: { "surface.app": "url(https://example.com)" } },
      }),
    /外部资源/,
  );
  assert.throws(
    () => validateThemePackage(manifest, { ...definition, tokens: { base: { a: "{b}", b: "{a}" } } }),
    /循环/,
  );
  const graph: Record<string, string> = { a: "x" };
  for (let index = 0; index < 20; index++) graph[`a${index}`] = `{${index ? `a${index - 1}` : "a"}}`.repeat(10);
  assert.throws(() => validateThemePackage(manifest, { ...definition, tokens: { base: graph } }), /过大/);
  const light = validateThemePackage(manifest, { ...definition, defaultVariant: "light" });
  assert.equal(light.theme.definition.variants?.light?.["surface.app"], "#234567");
});

test("registry preserves actual switches and installed themes across reopen; required modules and active themes are protected", () =>
  workspace((root) => {
    const dbPath = join(root, "app.db"),
      folder = join(root, "plugins");
    let db = openDatabase(dbPath);
    const builtin = [
      { id: "glaze.home", name: "首页", version: "0.0.0", description: "首页" },
      { id: "glaze.works", name: "作品管理", version: "0.0.0", description: "作品" },
    ];
    const logs = new LogService(join(root, "logs"));
    try {
      let store = new PreferenceStore(db);
      let registry = new PluginRegistry(store, folder, builtin, [], logs, () => {});
      assert.throws(() => registry.setEnabled("glaze.home", false), /不能/);
      registry.setEnabled("glaze.works", false);
      assert.throws(() => registry.assertMethodEnabled("works.save"), /停用/);
      registry.assertMethodEnabled("works.list");
      const preview = registry.preview(themeFixture().bytes);
      assert.equal(registry.snapshot().themes.length, 0);
      registry.install(preview.token);
      assert.throws(() => registry.install(preview.token), /过期/);
      assert.equal(registry.snapshot().themes[0]?.id, "demo.ocean");
      const appearance = new AppearanceService(store, () => registry.snapshot().themes);
      appearance.set({ themeId: "demo.ocean", colorMode: "dark", scale: 110 });
      assert.throws(() => registry.setEnabled("demo.ocean", false), /切换主题/);
      store.set("appearance", { themeId: "ore-ui", colorMode: "dark", scale: 100 });
      registry.setEnabled("demo.ocean", false);
      const next = registry.preview(themeFixture("1.1.0").bytes);
      assert.equal(next.previousVersion, "1.0.0");
      registry.install(next.token);
      assert.equal(registry.snapshot().themes.length, 0);
      db.close();
      db = openDatabase(dbPath);
      store = new PreferenceStore(db);
      registry = new PluginRegistry(store, folder, builtin, [], logs, () => {});
      assert.equal(registry.snapshot().plugins.find((item) => item.id === "glaze.works")?.enabled, false);
      assert.equal(registry.snapshot().plugins.find((item) => item.id === "demo.ocean")?.version, "1.1.0");
      assert.equal(registry.snapshot().themes.length, 0);
      registry.setEnabled("demo.ocean", true);
      db.exec("PRAGMA query_only = ON");
      assert.throws(() => registry.setEnabled("demo.ocean", false));
      assert.equal(registry.snapshot().themes.length, 1);
      assert.throws(() => registry.preview(themeFixture().bytes), /更高版本/);
    } finally {
      db.close();
    }
  }));

test("corrupt and symlinked installed packages are unavailable without affecting bundled modules", () =>
  workspace((root) => {
    const db = openDatabase(":memory:");
    try {
      const directory = join(root, "plugins");
      mkdirSync(join(directory, "demo.broken", "1.0.0"), { recursive: true });
      writeFileSync(join(directory, "demo.broken", "1.0.0", "package.json"), "bad-json");
      const outside = join(root, "outside");
      mkdirSync(outside);
      symlinkSync(outside, join(directory, "demo.link"), "junction");
      const registry = new PluginRegistry(
        new PreferenceStore(db),
        directory,
        [{ id: "glaze.settings", name: "设置", version: "0.0.0", description: "设置" }],
        [],
        new LogService(join(root, "logs")),
        () => {},
      );
      assert.equal(registry.snapshot().plugins.find((item) => item.id === "glaze.settings")?.enabled, true);
      assert.ok(registry.snapshot().plugins.find((item) => item.id === "demo.broken")?.error);
      assert.ok(registry.snapshot().plugins.find((item) => item.id === "demo.link")?.error);
    } finally {
      db.close();
    }
  }));

test("real logs redact credentials, filter/export, survive restart and clear only owned log files", () =>
  workspace((root) => {
    const directory = join(root, "logs");
    let logs = new LogService(directory);
    logs.write(
      "error",
      "rpc",
      'NTES_SESS=topsecret token="private-token" password=secret123 https://private.example/path?token=x',
    );
    logs.write("warn", "plugins", "插件已停用");
    const page = logs.list({ level: "error" });
    assert.equal(page.entries.length, 1);
    assert.doesNotMatch(JSON.stringify(page), /topsecret|private-token|secret123|private\.example/);
    assert.doesNotMatch(logs.export({ level: "all" }).text, /topsecret|private-token|secret123/);
    const raw = readdirSync(directory)
      .map((name) => readFileSync(join(directory, name), "utf8"))
      .join();
    assert.doesNotMatch(raw, /topsecret|private-token|secret123/);
    logs = new LogService(directory);
    assert.equal(logs.list({ level: "warn" }).entries.length, 1);
    writeFileSync(join(directory, "keep.txt"), "retain");
    logs.clear();
    assert.deepEqual(logs.list({ level: "all" }).entries, []);
    assert.equal(readFileSync(join(directory, "keep.txt"), "utf8"), "retain");
    assert.doesNotMatch(
      redactLog("Cookie: NTES_SESS=a; more=b\nAuthorization: Bearer secret"),
      /NTES_SESS|Bearer|secret/,
    );
    assert.doesNotMatch(
      redactLog('{"Authorization":"Bearer private-header","Cookie":"session=private-cookie"}'),
      /private-header|private-cookie/,
    );
  }));

test("logs bound the viewer, rotate before overflow and retain only fourteen days", () =>
  workspace((root) => {
    let now = new Date("2026-10-16T00:00:00Z");
    const directory = join(root, "logs");
    const logs = new LogService(
      directory,
      () => {},
      () => now,
    );
    for (let index = 0; index < 1400; index++) logs.write("info", "test", `${index} ${"a".repeat(1490)}`);
    assert.ok(existsSync(join(directory, "2026-10-16.1.jsonl")));
    const page = logs.list({ level: "all" });
    assert.equal(page.entries.length, 500);
    assert.equal(page.truncated, true);
    assert.match(page.entries[0]?.message ?? "", /^1399 /);
    now = new Date("2026-10-30T00:00:00Z");
    logs.write("info", "app", "新一天");
    assert.equal(existsSync(join(directory, "2026-10-16.jsonl")), false);
    assert.equal(logs.list({ level: "all" }).entries.length, 1);
    writeFileSync(join(directory, "2026-10-30.jsonl"), "not-json");
    assert.throws(() => logs.list({ level: "all" }), /损坏/);
  }));
