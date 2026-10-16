import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { AppearanceService } from "../apps/desktop/src/main/preferences/appearance";
import {
  defaultAppearance,
  defaultRankingBoards,
  isAppearanceSettings,
  isRankingLayout,
} from "../packages/contracts/src/rpc/appearance";
import { openDatabase } from "../packages/storage/src/db/database";
import { PreferenceStore } from "../packages/storage/src/db/preferences";
import { migrations } from "../packages/storage/src/migrations";

test("appearance and layout survive database reopen; reset leaves appearance and accounts intact", () => {
  const directory = mkdtempSync(join(tmpdir(), "glaze-appearance-"));
  const file = join(directory, "test.db");
  let db = openDatabase(file);
  try {
    let store = new PreferenceStore(db);
    let service = new AppearanceService(store);
    assert.deepEqual(service.get(), defaultAppearance);
    assert.deepEqual(service.getRanking(), defaultRankingBoards);
    const selected = { themeId: "ore-ui", colorMode: "system", scale: 125 };
    service.set(selected);
    service.setRanking(["pe_download", "pe_sell"]);
    store.set("unrelated", { keep: true });
    db.exec(
      "INSERT INTO accounts (id, nickname, login_method, last_login_at, status) VALUES ('test', 'test', 'cookie', 0, 'offline')",
    );
    db.close();
    db = openDatabase(file);
    store = new PreferenceStore(db);
    service = new AppearanceService(store);
    assert.deepEqual(service.get(), selected);
    assert.deepEqual(service.getRanking(), ["pe_download", "pe_sell"]);
    store.setLayout("future-page", { widgets: [] });
    assert.deepEqual(service.resetLayouts(), defaultRankingBoards);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM layouts").get()?.count, 0);
    assert.deepEqual(service.get(), selected);
    assert.deepEqual(store.get("unrelated"), { keep: true });
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM accounts").get()?.count, 1);
    db.close();
    db = openDatabase(file);
    assert.deepEqual(new AppearanceService(new PreferenceStore(db)).getRanking(), defaultRankingBoards);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid writes are rejected and damaged or unsupported stored data uses defaults", () => {
  const db = openDatabase(":memory:");
  try {
    const store = new PreferenceStore(db);
    const service = new AppearanceService(store);
    service.set(defaultAppearance);
    for (const value of [
      null,
      {},
      { ...defaultAppearance, scale: 500 },
      { ...defaultAppearance, themeId: "fluent-dark", colorMode: "light" },
    ]) {
      assert.equal(isAppearanceSettings(value), false);
      assert.throws(() => service.set(value));
      assert.deepEqual(service.get(), defaultAppearance);
    }
    for (const value of [
      null,
      [],
      ["fake"],
      ["pe_hot", "pe_hot"],
      ["pc_download"],
      ["pc_like"],
      ["pe_hot", "pc_like"],
    ]) {
      assert.equal(isRankingLayout(value), false);
      assert.throws(() => service.setRanking(value));
    }
    // Old stored desktop layouts must not revive removed tabs or break settings restoration
    for (const value of [
      ["pc_download", "pc_like"],
      ["pe_hot", "pc_like"],
    ]) {
      store.setLayout("glaze.home/ranking", value);
      assert.deepEqual(service.getRanking(), defaultRankingBoards);
    }
    db.exec("UPDATE settings SET value_json = '{bad json' WHERE key = 'appearance'");
    assert.deepEqual(service.get(), defaultAppearance);
    store.set("appearance", { ...defaultAppearance, themeId: "removed-theme" });
    assert.deepEqual(service.get(), defaultAppearance);
    service.setRanking(["pe_download"]);
    db.exec("UPDATE layouts SET version = 99");
    assert.deepEqual(service.getRanking(), defaultRankingBoards);
  } finally {
    db.close();
  }
});

test("migration from the account-only schema preserves data and creates a pre-upgrade backup", () => {
  const directory = mkdtempSync(join(tmpdir(), "glaze-migration-"));
  const file = join(directory, "test.db");
  let db = new DatabaseSync(file);
  try {
    assert.ok(migrations[0]);
    db.exec(migrations[0]);
    db.exec("CREATE TABLE schema_version (version INTEGER NOT NULL); INSERT INTO schema_version VALUES (1)");
    db.exec(
      "INSERT INTO accounts (id, nickname, login_method, last_login_at, status) VALUES ('existing', 'existing', 'cookie', 0, 'offline')",
    );
    db.close();
    db = openDatabase(file);
    assert.equal(db.prepare("SELECT id FROM accounts").get()?.id, "existing");
    assert.equal(db.prepare("SELECT MAX(version) AS version FROM schema_version").get()?.version, 2);
    const backupName = readdirSync(directory).find((name) => name.endsWith(".bak"));
    assert.ok(backupName);
    const backup = new DatabaseSync(join(directory, backupName), { readOnly: true });
    try {
      assert.equal(backup.prepare("SELECT MAX(version) AS version FROM schema_version").get()?.version, 1);
      assert.equal(backup.prepare("SELECT id FROM accounts").get()?.id, "existing");
    } finally {
      backup.close();
    }
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("storage failures propagate instead of claiming success", () => {
  const db = openDatabase(":memory:");
  const service = new AppearanceService(new PreferenceStore(db));
  db.close();
  assert.throws(() => service.set(defaultAppearance));
  assert.throws(() => service.resetLayouts());
});
