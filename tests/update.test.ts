import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityError } from "../apps/desktop/src/main/ipc/errors";
import { type Updater, UpdateService, type UpdateTimers } from "../apps/desktop/src/main/update/service";
import { capabilities, type UpdateState } from "../packages/contracts/src";
import { readSchemas } from "../packages/mcp/src/tools";
import { openDatabase, PreferenceStore } from "../packages/storage/src";

type Listener = (value?: unknown) => void;

/** Scripted electron-updater: each check resolves with the events the test queues */
class FakeUpdater implements Updater {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  checks = 0;
  installs: [boolean, boolean][] = [];
  listeners = new Map<string, Listener[]>();
  script: (updater: FakeUpdater) => Promise<unknown> = async (updater) => updater.emit("update-not-available");

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, value?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }

  checkForUpdates(): Promise<unknown> {
    this.checks++;
    return this.script(this);
  }

  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void {
    this.installs.push([isSilent, isForceRunAfter]);
  }
}

/** Manual timers so scheduling is observable without waiting */
function timers() {
  const scheduled: { kind: "timeout" | "interval"; ms: number; run: () => void; cleared: boolean }[] = [];
  const clock: UpdateTimers = {
    setTimeout: (run, ms) => scheduled[scheduled.push({ kind: "timeout", ms, run, cleared: false }) - 1],
    setInterval: (run, ms) => scheduled[scheduled.push({ kind: "interval", ms, run, cleared: false }) - 1],
    clear: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
  };
  return { scheduled, clock };
}

function fixture(updater: FakeUpdater | null = new FakeUpdater()) {
  const store = new PreferenceStore(openDatabase(":memory:"));
  const events: UpdateState[] = [];
  const logs: string[] = [];
  const { scheduled, clock } = timers();
  const service = new UpdateService(
    store,
    updater,
    "0.1.0",
    (state) => events.push(state),
    (_, message) => logs.push(message),
    clock,
  );
  return { service, updater, store, events, logs, scheduled };
}

test("development and portable copies report unsupported and never schedule checks", async () => {
  const { service, scheduled } = fixture(null);
  assert.equal(service.state().phase, "unsupported");
  assert.equal(service.state().currentVersion, "0.1.0");
  assert.equal((await service.check()).phase, "unsupported");
  service.start();
  assert.equal(scheduled.length, 0);
  assert.throws(() => service.install(), CapabilityError);
});

test("a check with no newer release ends at latest with a check time", async () => {
  const { service, updater } = fixture();
  assert.equal(updater?.autoDownload, true);
  assert.equal(updater?.autoInstallOnAppQuit, true);
  const state = await service.check();
  assert.equal(state.phase, "latest");
  assert.equal(state.latestVersion, null);
  assert.ok(state.checkedAt);
});

test("an available release downloads with whole-percent progress, then waits for restart", async () => {
  const updater = new FakeUpdater();
  updater.script = async (u) => {
    u.emit("update-available", {
      version: "0.2.0",
      releaseNotes: "<h2>新功能</h2><ul><li>自动更新</li><li>A &amp; B</li></ul>",
    });
  };
  const { service, events } = fixture(updater);
  const checked = await service.check();
  assert.equal(checked.phase, "downloading");
  assert.equal(checked.latestVersion, "0.2.0");
  assert.equal(checked.releaseNotes, "新功能\n· 自动更新\n· A & B");
  const before = events.length;
  updater.emit("download-progress", { percent: 10.2 });
  updater.emit("download-progress", { percent: 10.7 });
  updater.emit("download-progress", { percent: 55 });
  assert.equal(events.length - before, 2, "sub-percent progress is not broadcast");
  assert.equal(service.state().progress, 0.55);
  // Checking again while downloading does not start another request
  await service.check();
  assert.equal(updater.checks, 1);
  updater.emit("update-downloaded", { version: "0.2.0" });
  assert.equal(service.state().phase, "downloaded");
  assert.equal(service.state().releaseNotes, "新功能\n· 自动更新\n· A & B", "keeps notes from the available event");
  assert.equal((await service.check()).phase, "downloaded", "a downloaded update is kept");
  assert.equal(updater.checks, 1);
  service.install();
  assert.deepEqual(updater.installs, [[true, true]]);
});

test("install is refused until the download finishes", () => {
  const { service, updater } = fixture();
  assert.throws(() => service.install(), /还没有下载完成/);
  assert.deepEqual(updater?.installs, []);
});

test("concurrent checks share one request", async () => {
  const updater = new FakeUpdater();
  let release: () => void = () => {};
  updater.script = (u) =>
    new Promise<void>((resolve) => {
      release = () => {
        u.emit("update-not-available");
        resolve();
      };
    });
  const { service } = fixture(updater);
  const first = service.check();
  const second = service.check();
  assert.equal(service.state().phase, "checking");
  release();
  assert.equal((await first).phase, "latest");
  assert.equal((await second).phase, "latest");
  assert.equal(updater.checks, 1);
});

test("failures become readable messages and raw details only reach the log", async () => {
  const cases: [string, RegExp][] = [
    ["net::ERR_INTERNET_DISCONNECTED", /无法连接 GitHub/],
    ["HttpError: 404 Not Found latest.yml", /暂时没有可用的发布版本/],
    ["sha512 checksum mismatch", /校验失败/],
    ["ENOSPC: no space left", /磁盘空间不足/],
    ["something odd at C:\\Users\\me", /检查更新失败/],
  ];
  for (const [raw, expected] of cases) {
    const updater = new FakeUpdater();
    updater.script = async (u) => {
      const error = new Error(raw);
      u.emit("error", error);
      throw error;
    };
    const { service, logs } = fixture(updater);
    const state = await service.check();
    assert.equal(state.phase, "error");
    assert.match(state.error ?? "", expected);
    assert.ok(!(state.error ?? "").includes(raw));
    assert.ok(logs.some((line) => line.includes(raw)));
  }
});

test("a rejection without an error event still ends the check", async () => {
  const updater = new FakeUpdater();
  updater.script = async () => {
    throw new Error("getaddrinfo ENOTFOUND github.com");
  };
  const { service } = fixture(updater);
  const state = await service.check();
  assert.equal(state.phase, "error");
  assert.match(state.error ?? "", /无法连接 GitHub/);
  // A retry clears the error
  updater.script = async (u) => u.emit("update-not-available");
  assert.equal((await service.check()).error, null);
});

test("an error after the download keeps the installable update", async () => {
  const updater = new FakeUpdater();
  updater.script = async (u) => {
    u.emit("update-available", { version: "0.2.0" });
    u.emit("update-downloaded", { version: "0.2.0" });
  };
  const { service } = fixture(updater);
  await service.check();
  updater.emit("error", new Error("late failure"));
  assert.equal(service.state().phase, "downloaded");
});

test("automatic checks follow the saved switch", () => {
  const { service, scheduled, store } = fixture();
  assert.equal(service.state().autoCheck, true);
  service.start();
  assert.deepEqual(
    scheduled.map(({ kind, ms }) => [kind, ms]),
    [
      ["timeout", 15_000],
      ["interval", 6 * 60 * 60 * 1000],
    ],
  );
  assert.equal(service.setAutoCheck(false).autoCheck, false);
  assert.ok(scheduled.every((entry) => entry.cleared));
  assert.deepEqual(store.get("update"), { autoCheck: false });
  assert.throws(() => service.setAutoCheck("yes"), CapabilityError);

  // A restart reads the saved choice and schedules nothing
  const restarted = new UpdateService(
    store,
    new FakeUpdater(),
    "0.1.0",
    () => {},
    () => {},
    timers().clock,
  );
  assert.equal(restarted.state().autoCheck, false);
});

test("scheduled checks run the shared check", async () => {
  const { service, scheduled, updater } = fixture();
  service.start();
  scheduled[0]?.run();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updater?.checks, 1);
  service.stop();
});

test("AI tools may read and check but never install or change the switch", () => {
  for (const method of ["update.state", "update.check"] as const) {
    assert.equal(capabilities[method].caller, "any");
    assert.equal(capabilities[method].risk, "read");
    assert.ok(capabilities[method].mcp);
    assert.ok(readSchemas[method]);
  }
  for (const method of ["update.install", "update.setAutoCheck"] as const) {
    assert.equal(capabilities[method].caller, "shell");
    assert.equal(capabilities[method].mcp, undefined);
    assert.equal(readSchemas[method], undefined);
  }
});
