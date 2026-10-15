import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { CacheService } from "../apps/desktop/src/main/preferences/cache";
import { GeneralService, type GeneralSystem } from "../apps/desktop/src/main/preferences/general";
import { defaultGeneral } from "../packages/contracts/src/rpc/general";
import { openDatabase } from "../packages/storage/src/db/database";
import { PreferenceStore } from "../packages/storage/src/db/preferences";

/** In-memory native adapter verifies side effects without changing Windows startup registration */
function nativeSystem() {
  let enabled = false;
  const writes: boolean[] = [];
  const system: GeneralSystem = {
    readLoginItem: () => ({ supported: true, enabled, warning: null }),
    setLoginItem: (value) => {
      writes.push(value);
      enabled = value;
    },
    ensureTray: () => {},
  };
  return { system, writes };
}

test("general preferences and safe last page survive a database reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "glaze-general-"));
  const file = join(directory, "test.db");
  const native = nativeSystem();
  let db = openDatabase(file);
  try {
    let service = new GeneralService(new PreferenceStore(db), native.system);
    service.set({ launchAtLogin: true, startPage: "last", closeAction: "quit" });
    service.rememberRoute("glaze.analytics/analytics");
    db.close();
    db = openDatabase(file);
    service = new GeneralService(new PreferenceStore(db), native.system);
    assert.deepEqual(service.get().settings, { launchAtLogin: true, startPage: "last", closeAction: "quit" });
    assert.deepEqual(service.initialRoute({ route: "glaze.home/home", params: {} }), {
      route: "glaze.analytics/analytics",
      params: {},
    });
    // Windows, including a user's external change, owns the authoritative startup state
    native.system.setLoginItem(false);
    assert.equal(service.get().settings.launchAtLogin, false);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("startup selection honors login/expiry, drops parameters and rejects unsafe last routes", () => {
  const db = openDatabase(":memory:");
  try {
    const store = new PreferenceStore(db);
    const service = new GeneralService(store, nativeSystem().system);
    service.set({ ...defaultGeneral, startPage: "works" });
    assert.equal(
      service.initialRoute({ route: "glaze.home/home", params: { itemId: "private" } }).route,
      "glaze.works/works",
    );
    for (const route of ["glaze.account/login", "glaze.account/login-expired"]) {
      const auth = { route, params: { id: "test-account" } };
      assert.deepEqual(service.initialRoute(auth), auth);
    }
    service.set({ ...defaultGeneral, startPage: "last" });
    service.rememberRoute("glaze.messages/messages");
    for (const route of ["https://example.com", "glaze.account/login", "glaze.works/works?itemId=1", undefined]) {
      assert.throws(() => service.rememberRoute(route));
      assert.equal(service.initialRoute({ route: "glaze.home/home", params: {} }).route, "glaze.messages/messages");
    }
    store.set("lastRoute", "removed.plugin/page");
    assert.deepEqual(service.initialRoute({ route: "glaze.home/home", params: { unsafe: "value" } }), {
      route: "glaze.home/home",
      params: {},
    });
    store.set("general", { startPage: "bad" });
    assert.deepEqual(service.preferences(), defaultGeneral);
  } finally {
    db.close();
  }
});

test("invalid settings and tray failure have no native startup side effects", () => {
  const db = openDatabase(":memory:");
  try {
    const native = nativeSystem();
    const service = new GeneralService(new PreferenceStore(db), native.system);
    for (const value of [
      null,
      {},
      { ...defaultGeneral, launchAtLogin: "true" },
      { ...defaultGeneral, closeAction: "hide" },
    ]) {
      assert.throws(() => service.set(value));
    }
    assert.deepEqual(native.writes, []);
    native.system.ensureTray = () => {
      throw new Error("tray unavailable");
    };
    assert.throws(() => service.set({ ...defaultGeneral, launchAtLogin: true }), /tray unavailable/);
    assert.deepEqual(native.writes, []);
    assert.deepEqual(service.preferences(), defaultGeneral);
  } finally {
    db.close();
  }
});

test("storage failure rolls startup registration back; unchanged startup preferences do not touch Windows", () => {
  const db = openDatabase(":memory:");
  try {
    const native = nativeSystem();
    const service = new GeneralService(new PreferenceStore(db), native.system);
    service.set({ ...defaultGeneral, startPage: "works" });
    assert.deepEqual(native.writes, []);
    db.exec("PRAGMA query_only = ON");
    assert.throws(() => service.set({ ...defaultGeneral, launchAtLogin: true }));
    assert.deepEqual(native.writes, [true, false]);
    assert.equal(service.get().settings.launchAtLogin, false);
    assert.equal(service.preferences().startPage, "works");
  } finally {
    db.close();
  }
});

test("Windows rejection does not persist success; unsupported platforms can still save other settings", () => {
  const db = openDatabase(":memory:");
  try {
    const native = nativeSystem();
    const service = new GeneralService(new PreferenceStore(db), native.system);
    native.system.setLoginItem = () => {};
    assert.throws(() => service.set({ ...defaultGeneral, launchAtLogin: true }), /未应用/);
    assert.equal(service.preferences().launchAtLogin, false);
    native.system.readLoginItem = () => ({ supported: false, enabled: false, warning: "unsupported" });
    assert.throws(() => service.set({ ...defaultGeneral, launchAtLogin: true }), /不支持/);
    assert.equal(service.set({ ...defaultGeneral, startPage: "works" }).settings.startPage, "works");
  } finally {
    db.close();
  }
});

test("cache cleanup coalesces concurrent calls, clears known resources and reports partial failures", async () => {
  let imageClears = 0;
  let notifications = 0;
  let resources = 0;
  let code = 0;
  const cache = new CacheService(
    {
      getCacheSize: async () => (resources === 0 ? 1024 : 0),
      clearCache: async () => {
        resources++;
      },
      clearCodeCaches: async () => {
        code++;
      },
    },
    () => {
      imageClears++;
    },
    () => {
      notifications++;
    },
  );
  const first = cache.clear();
  const second = cache.clear();
  assert.equal(first, second);
  assert.deepEqual(await first, { clearedBytes: 1024, warnings: [] });
  assert.deepEqual([resources, code, imageClears, notifications], [1, 1, 1, 1]);
  const failing = new CacheService(
    {
      getCacheSize: async () => 1024,
      clearCache: async () => {
        throw new Error("locked");
      },
      clearCodeCaches: async () => {
        code++;
      },
    },
    () => {
      imageClears++;
    },
    () => {
      notifications++;
    },
  );
  const result = await failing.clear();
  assert.equal(result.clearedBytes, 0);
  assert.match(result.warnings.join(), /资源缓存清理失败/);
  assert.deepEqual([resources, code, imageClears, notifications], [1, 2, 2, 2]);
});
