import assert from "node:assert/strict";
import test from "node:test";
import { changedModule } from "../apps/desktop/src/main/ipc/data-changes";
import { WorkArchiveStore } from "../packages/plugin-sdk/src/work-archive-store";
import {
  clearWorkListPositions,
  rememberWorkListPosition,
  workListMode,
  workListPosition,
} from "../plugins/works/src/view-state";

test("archive initialization coalesces across routes and cached navigation never waits for the host", async () => {
  let resolve: (ids: string[]) => void = () => {};
  let calls = 0;
  let receive: (account: string, ids: string[]) => void = () => {};
  const store = new WorkArchiveStore(
    () => {
      calls++;
      return new Promise((done) => {
        resolve = done;
      });
    },
    (listener) => {
      receive = listener;
    },
  );
  const initial = store.load("a");
  assert.equal(store.load("a"), initial);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolve(["1"]);
  assert.deepEqual(await initial, ["1"]);
  assert.equal(store.snapshot("a").ready, true);
  assert.deepEqual(await store.load("a"), ["1"]);
  assert.equal(calls, 1);
  const refresh = store.load("a", true);
  assert.equal(store.snapshot("a").ready, true);
  assert.deepEqual(store.snapshot("a").ids, ["1"]);
  await Promise.resolve();
  receive("a", ["2"]);
  resolve(["old"]);
  assert.deepEqual(await refresh, ["2"]);
  assert.deepEqual(store.snapshot("a").ids, ["2"]);
  assert.equal(store.snapshot("b").ready, false);
});

test("failed archive reads are retryable and late errors cannot erase a pushed state", async () => {
  let reject: (error: Error) => void = () => {};
  let receive: (account: string, ids: string[]) => void = () => {};
  let fail = true;
  const store = new WorkArchiveStore(
    () => (fail ? Promise.reject(new Error("offline")) : Promise.resolve(["1"])),
    (listener) => {
      receive = listener;
    },
  );
  await assert.rejects(store.load("a"), /offline/);
  assert.equal(store.snapshot("a").loading, false);
  assert.equal(store.snapshot("a").ready, false);
  fail = false;
  assert.deepEqual(await store.load("a", true), ["1"]);
  assert.equal(store.snapshot("a").error, null);
  const pendingStore = new WorkArchiveStore(
    () =>
      new Promise((_resolve, failed) => {
        reject = failed;
      }),
    (listener) => {
      receive = listener;
    },
  );
  const pending = pendingStore.load("a");
  await Promise.resolve();
  receive("a", ["2"]);
  reject(new Error("obsolete failure"));
  assert.deepEqual(await pending, ["2"]);
  assert.equal(pendingStore.snapshot("a").error, null);
});

test("archive store keeps push updates while the page is unmounted", async () => {
  let receive: (account: string, ids: string[]) => void = () => {};
  const store = new WorkArchiveStore(
    async () => [],
    (listener) => {
      receive = listener;
    },
  );
  let updates = 0;
  const unsubscribe = store.subscribe("a", () => {
    updates++;
  });
  await store.load("a");
  unsubscribe();
  const before = updates;
  receive("a", ["3"]);
  assert.equal(updates, before);
  assert.deepEqual(store.snapshot("a").ids, ["3"]);
  assert.deepEqual(await store.load("a"), ["3"]);
});

test("normal and archived navigation preserve separate positions without cross-account leakage", () => {
  clearWorkListPositions();
  rememberWorkListPosition("a", 3, 200);
  rememberWorkListPosition("a", 1, 80, true);
  assert.deepEqual(workListPosition("a"), { page: 3, scrollTop: 200 });
  assert.deepEqual(workListPosition("a", true), { page: 1, scrollTop: 80 });
  assert.equal(workListMode("a"), true);
  assert.deepEqual(workListPosition("b", true), { page: 0, scrollTop: 0 });
  clearWorkListPositions();
  assert.equal(workListMode("a"), false);
});

test("local archive writes do not invalidate unchanged platform lists and covers", () => {
  for (const method of ["works.archive", "works.restore", "works.archiveMigrate"])
    assert.equal(changedModule(method), null);
  assert.equal(changedModule("works.save"), "works");
  assert.equal(changedModule("works.publish"), "works");
});
