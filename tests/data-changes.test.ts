import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { changedModule } from "../apps/desktop/src/main/ipc/data-changes";
import {
  affectedModules,
  hostQueryKey,
  hostQuerySnapshot,
  readHostQuery,
  subscribeHostQuery,
} from "../packages/plugin-sdk/src/query/host-query";

test("only platform writes report a changed module; reads, staging uploads and app settings do not", () => {
  assert.equal(changedModule("works.save"), "works");
  assert.equal(changedModule("works.delete"), "works");
  assert.equal(changedModule("comments.reply"), "comments");
  assert.equal(changedModule("messages.get"), "messages");
  assert.equal(changedModule("promotion.join"), "promotion");
  for (const method of [
    "works.page",
    "works.list",
    "works.upload",
    "works.uploadDroppedResource",
    "works.prepareImage",
    "promotion.upload",
    "appearance.set",
    "mcp.grant",
  ])
    assert.equal(changedModule(method), null, method);
});

test("a work change also refreshes dependent views such as income estimates", () => {
  assert.deepEqual([...affectedModules(["works"])].sort(), ["analytics", "income", "promotion", "works"]);
  assert.deepEqual([...affectedModules(["comments"])], ["comments"]);
});

test("data.changed refreshes visible reads at once, expires hidden ones, and ignores reads that predate the change", async (t) => {
  t.after(() => {
    delete (globalThis as { glaze?: unknown }).glaze;
  });
  const handlers = new Map<string, (payload: unknown) => void>();
  let version = 0;
  let calls = 0;
  let slow = false;
  Object.assign(globalThis, {
    glaze: {
      on: (event: string, handler: (payload: unknown) => void) => {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      },
      rpc: async () => {
        calls++;
        const value = version;
        await delay(slow ? 40 : 1);
        return { ok: true, value };
      },
    },
  });
  const session = JSON.stringify(["a", 1, false]);
  const visible = hostQueryKey(session, "income.estimate", "null");
  const hidden = hostQueryKey(session, "works.page", "null");
  const stop = subscribeHostQuery(visible, "income.estimate", null, () => {});
  await readHostQuery(visible, "income.estimate", null);
  await readHostQuery(hidden, "works.page", null);
  assert.equal(calls, 2);

  // A visible dependent read reloads in the background while keeping its data
  version = 1;
  handlers.get("data.changed")?.({ modules: ["works"] });
  assert.equal(hostQuerySnapshot(visible).data, 0);
  await delay(10);
  assert.equal(hostQuerySnapshot(visible).data, 1);
  assert.equal(calls, 3);
  // The hidden read is only marked stale and refetches when next read
  await readHostQuery(hidden, "works.page", null);
  assert.equal(hostQuerySnapshot(hidden).data, 1);
  assert.equal(calls, 4);

  // A read in flight when the change arrives cannot leave old data behind
  slow = true;
  version = 2;
  const early = readHostQuery(visible, "income.estimate", null, { force: true });
  version = 3;
  handlers.get("data.changed")?.({ modules: ["income"] });
  await early;
  await delay(60);
  assert.equal(hostQuerySnapshot(visible).data, 3);
  stop();
});
