import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { SessionSettingsService } from "../apps/desktop/src/main/preferences/session-settings";
import { SessionManager } from "../apps/desktop/src/main/session/session-manager";
import { type AccountChanged, capabilities, defaultSessionSettings } from "../packages/contracts/src";
import { fail, ok } from "../packages/netease/src/errors";
import { AccountStore, openDatabase, PreferenceStore, Vault } from "../packages/storage/src";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Seed synthetic credentials only; each case owns its database and session lifecycle */
function fixture(autoLogin = true) {
  const db = openDatabase(":memory:");
  const accounts = new AccountStore(db);
  const vault = new Vault(db, {
    encrypt: (text) => Buffer.from(text),
    decrypt: (bytes) => Buffer.from(bytes).toString(),
  });
  const settings = new SessionSettingsService(new PreferenceStore(db));
  settings.set({ autoLogin, notifyOnExpire: true });
  for (const id of ["a", "b"]) {
    accounts.save({
      id,
      nickname: id,
      passport: null,
      avatarUrl: null,
      loginMethod: "cookie",
      lastLoginAt: 0,
      status: "active",
      current: false,
    });
    vault.saveSession(id, `fixture-${id}`);
  }
  accounts.setCurrent("a");
  const notifications: number[] = [];
  const changes: AccountChanged[] = [];
  const events = {
    changed: (value: AccountChanged) => changes.push(value),
    progress: () => {},
    expired: () => notifications.push(1),
  };
  const create = () => new SessionManager(accounts, vault, events, () => settings.get());
  return { db, accounts, vault, settings, notifications, changes, create, manager: create() };
}

/** Provide a valid profile response without contacting NetEase */
function profileResponse() {
  return new Response(JSON.stringify({ status: "ok", data: { nickname: "fixture", level: 1, exp: 0 } }));
}

test("settings persist across reopen, validate booleans and remain restricted to the shell", () => {
  const directory = mkdtempSync(join(tmpdir(), "glaze-session-settings-"));
  const path = join(directory, "settings.db");
  let db = openDatabase(path);
  try {
    const service = new SessionSettingsService(new PreferenceStore(db));
    assert.deepEqual(service.get(), defaultSessionSettings);
    const saved = service.set({ autoLogin: false, notifyOnExpire: false });
    for (const invalid of [
      null,
      {},
      [],
      { autoLogin: "false", notifyOnExpire: false },
      { ...saved, cookie: "fixture" },
    ]) {
      assert.throws(() => service.set(invalid), /会话设置无效/);
      assert.deepEqual(service.get(), saved);
    }
    db.close();
    db = openDatabase(path);
    assert.deepEqual(new SessionSettingsService(new PreferenceStore(db)).get(), saved);
    assert.equal(capabilities["sessionSettings.set"].risk, "write");
    for (const method of ["sessionSettings.get", "sessionSettings.set"] as const) {
      assert.equal(capabilities[method].caller, "shell");
      assert.equal(capabilities[method].mcp, undefined);
    }
  } finally {
    db.close();
    assert.equal(join(tmpdir(), directory.slice(tmpdir().length)), directory);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("disabled auto login leaves saved credentials intact and makes no startup request", async () => {
  const f = fixture(false);
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return profileResponse();
  };
  try {
    assert.equal(f.manager.current(), null);
    assert.ok(f.manager.list().every((account) => !account.current));
    assert.equal(f.manager.initialRoute().route, "glaze.account/login");
    await f.manager.restore();
    assert.equal(requests, 0);
    assert.equal(f.vault.loadSession("a"), "fixture-a");
    assert.equal(f.accounts.get("a")?.current, true);
    await f.manager.switchTo("a");
    assert.equal(requests, 1);
    assert.equal(f.manager.current()?.id, "a");
    assert.equal(f.manager.initialRoute().route, "glaze.home/home");
  } finally {
    f.db.close();
  }
});

test("auto login changes affect the next manager, not the running account", async () => {
  const f = fixture();
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return profileResponse();
  };
  try {
    await f.manager.restore();
    assert.equal(requests, 1);
    f.settings.set({ autoLogin: false, notifyOnExpire: true });
    assert.equal(f.manager.current()?.id, "a");
    assert.equal(f.create().current(), null);
    f.settings.set({ autoLogin: true, notifyOnExpire: true });
    const next = f.create();
    assert.equal(next.current()?.id, "a");
    await next.restore();
    assert.equal(requests, 2);
    next.logout();
    assert.equal(f.create().current(), null);
    assert.equal(f.vault.loadSession("a"), null);
    assert.equal(f.notifications.length, 0);
  } finally {
    f.db.close();
  }
});

test("concurrent expiry only notifies once, and a late offline response cannot reset expiry", async () => {
  const f = fixture();
  try {
    const results = await Promise.allSettled([
      f.manager.request(undefined, async () => fail({ kind: "session_expired" })),
      f.manager.request(undefined, async () => fail({ kind: "network", cause: "fixture" })),
      f.manager.request(undefined, async () => fail({ kind: "session_expired" })),
    ]);
    assert.ok(results.every((result) => result.status === "rejected"));
    assert.equal(f.manager.current()?.status, "expired");
    assert.equal(f.notifications.length, 1);
    assert.equal(f.changes.length, 1);
    assert.equal(f.manager.initialRoute().route, "glaze.account/login-expired");
  } finally {
    f.db.close();
  }
});

test("disabled reminders still expire the account and live settings apply on the next transition", async () => {
  const f = fixture();
  globalThis.fetch = async () => profileResponse();
  try {
    f.settings.set({ autoLogin: true, notifyOnExpire: false });
    await assert.rejects(f.manager.request(undefined, async () => fail({ kind: "session_expired" })));
    assert.equal(f.manager.current()?.status, "expired");
    assert.equal(f.notifications.length, 0);
    await f.manager.verify();
    f.settings.set({ autoLogin: true, notifyOnExpire: true });
    await assert.rejects(f.manager.request(undefined, async () => fail({ kind: "session_expired" })));
    assert.equal(f.notifications.length, 1);
  } finally {
    f.db.close();
  }
});

test("offline, business and parse failures do not issue expiry notifications", async () => {
  const f = fixture();
  try {
    await assert.rejects(f.manager.request(undefined, async () => fail({ kind: "network", cause: "fixture" })));
    assert.equal(f.manager.current()?.status, "offline");
    await f.manager.request(undefined, async () => ok(true));
    assert.equal(f.manager.current()?.status, "active");
    await assert.rejects(
      f.manager.request(undefined, async () => fail({ kind: "business", code: "test", message: "test" })),
    );
    await assert.rejects(f.manager.request(undefined, async () => fail({ kind: "parse", endpoint: "test" })));
    assert.equal(f.notifications.length, 0);
  } finally {
    f.db.close();
  }
});

test("expiry of another saved account does not notify for the current account", async () => {
  const f = fixture();
  try {
    await assert.rejects(f.manager.request("b", async () => fail({ kind: "session_expired" })));
    assert.equal(f.manager.current()?.status, "active");
    assert.equal(f.accounts.get("b")?.status, "expired");
    assert.equal(f.notifications.length, 0);
  } finally {
    f.db.close();
  }
});
