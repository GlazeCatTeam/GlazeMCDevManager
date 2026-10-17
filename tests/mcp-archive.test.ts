import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { createMcpBusiness } from "../apps/desktop/src/main/mcp/business";
import { createMcpWorkReads } from "../apps/desktop/src/main/mcp/work-visibility";
import { WorkArchiveService } from "../apps/desktop/src/main/works/archive";
import {
  type AccountSummary,
  emptyWorkCreateFields,
  type GlazeBridge,
  mcpPermissions,
} from "../packages/contracts/src";
import { emptyMcpData, type McpError, type McpPorts } from "../packages/mcp/src/model";
import { McpService } from "../packages/mcp/src/service";
import { archiveStorageKey, initializeWorkArchive } from "../packages/plugin-sdk/src/work-archive";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function storageFixture() {
  const records = new Map<string, unknown>();
  const events: { account: string; itemIds: string[] }[] = [];
  let failing = false;
  const store = {
    get: (key: string) => structuredClone(records.get(key)),
    set: (key: string, value: unknown) => {
      if (failing) throw new Error("disk full");
      records.set(key, structuredClone(value));
    },
  };
  const create = () =>
    new WorkArchiveService(
      store,
      (account) => ["a", "b"].includes(account),
      (account, itemIds) => events.push({ account, itemIds }),
    );
  return {
    records,
    events,
    create,
    archives: create(),
    fail: (value: boolean) => {
      failing = value;
    },
  };
}

test("archive storage migrates once, survives restart, isolates accounts and preserves failures", () => {
  const f = storageFixture();
  assert.throws(() => f.archives.get("a"), { kind: "archive_not_ready" });
  assert.deepEqual(f.archives.migrate("a", ["1", "1", "2"]), ["1", "2"]);
  f.archives.migrate("b", []);
  assert.deepEqual(f.archives.set("a", "1", false), ["2"]);
  assert.deepEqual(
    f.archives.migrate("a", ["1", "2"]),
    ["2"],
    "old renderer snapshots cannot resurrect restored works",
  );
  assert.deepEqual(f.create().get("a"), ["2"]);
  assert.deepEqual(f.archives.get("b"), []);
  assert.throws(() => f.archives.get("other"), { kind: "not_found" });
  const events = f.events.length;
  f.fail(true);
  assert.throws(() => f.archives.set("a", "2", false), { kind: "storage" });
  assert.deepEqual(f.archives.get("a"), ["2"]);
  assert.equal(f.events.length, events);
  f.fail(false);
  f.records.set("works.archive.v1:a", { bad: true });
  assert.throws(() => f.archives.migrate("a", []), { kind: "storage" });
  assert.deepEqual(f.records.get("works.archive.v1:a"), { bad: true });
});

test("renderer migration retains old records and uses canonical state after restoration", async () => {
  const f = storageFixture();
  const bridgeDescriptor = Object.getOwnPropertyDescriptor(globalThis, "glaze");
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const legacy = new Map([[archiveStorageKey("a"), '["1","2"]']]);
  let notify: ((payload: { account: string; itemIds: string[] }) => void) | undefined;
  const bridge = {
    on: (_event: string, listener: typeof notify) => {
      notify = listener;
      return () => {};
    },
    rpc: async (method: string, params: { account: string; itemIds: string[] }) => {
      try {
        return {
          ok: true,
          value:
            method === "works.archiveState"
              ? f.archives.get(params.account)
              : f.archives.migrate(params.account, params.itemIds),
        };
      } catch (error) {
        return { ok: false, error: { kind: (error as McpError).kind, message: (error as Error).message } };
      }
    },
  } as unknown as GlazeBridge;
  Object.defineProperty(globalThis, "glaze", { configurable: true, value: bridge });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => legacy.get(key) ?? null },
  });
  try {
    assert.deepEqual(await initializeWorkArchive("a"), ["1", "2"]);
    assert.equal(legacy.get(archiveStorageKey("a")), '["1","2"]');
    f.archives.set("a", "1", false);
    notify?.({ account: "a", itemIds: ["2"] });
    assert.deepEqual(await initializeWorkArchive("a"), ["2"]);
    legacy.set(archiveStorageKey("b"), "broken");
    await assert.rejects(initializeWorkArchive("b"));
    assert.throws(() => f.archives.get("b"), { kind: "archive_not_ready" });
  } finally {
    if (bridgeDescriptor) Object.defineProperty(globalThis, "glaze", bridgeDescriptor);
    else Reflect.deleteProperty(globalThis, "glaze");
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

function fixture() {
  const f = storageFixture();
  f.archives.migrate("a", ["1", "3"]);
  f.archives.migrate("b", []);
  const remote = {
    itemId: "1",
    status: "init" as const,
    version: "1",
    modCode: "",
    guides: [],
    fields: { ...emptyWorkCreateFields(), item_name: "作品 1" },
  };
  const counts = { details: 0, editor: 0, save: 0 };
  const account: AccountSummary = {
    id: "a",
    nickname: "隔离测试",
    passport: null,
    avatarUrl: null,
    loginMethod: "cookie",
    lastLoginAt: 0,
    status: "active",
    current: true,
  };
  const sessions = {
    request: async <T>(
      _account: string | undefined,
      read: (session: { sessionCookie: string }) => Promise<{ ok: true; value: T } | { ok: false; error: unknown }>,
    ): Promise<T> => {
      const result = await read({ sessionCookie: "OFFLINE_TEST_ONLY" });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      return result.value;
    },
  };
  const reads = createMcpWorkReads(sessions, f.archives);
  const ports: McpPorts = {
    save: () => {},
    changed: () => {},
    accounts: () => [account, { ...account, id: "b", current: false }],
    assertEnabled: () => {},
    assertWorkAccess: (account, ids, include) => f.archives.assertAccess(account, ids, include),
    read: async (method, params) => {
      if (["works.list", "works.archiveState"].includes(method)) return reads(method, params);
      counts.details++;
      return { itemId: params.itemId, name: "归档内容" };
    },
    editor: async () => {
      counts.editor++;
      return structuredClone(remote);
    },
    options: async () => {
      throw new Error("unused");
    },
    validate: async () => [],
    saveWork: async (_draft, patch, beforeWrite) => {
      beforeWrite();
      counts.save++;
      Object.assign(remote.fields, patch);
    },
    createWork: async () => {
      throw new Error("unused");
    },
    review: async () => ({ needCheckApply: false, queueLength: 0 }),
    pickFile: async () => null,
    upload: async () => {
      throw new Error("unused");
    },
    invoke: createMcpBusiness(sessions, undefined, f.archives),
    assetRoot: join(tmpdir(), "glaze-archive-test-unused"),
  };
  const service = new McpService(emptyMcpData(), ports);
  service.data.enabled = true;
  service.status = "running";
  service.accessWaitMs = 0;
  const client = service.registerClient("归档隔离测试");
  service.connected(client.id, () => {});
  service.grant(client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  const call = (name: string, params: Record<string, unknown> = {}) => service.call(client.id, name, params);
  return { ...f, remote, counts, ports, service, client, call };
}

function platformWorks() {
  const requests: URL[] = [];
  const rows = Array.from({ length: 4 }, (_, index) => ({
    item_id: String(index + 1),
    item_name: `作品 ${index + 1}`,
    status: "init",
    create_time: "2026-10-01",
  }));
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    const start = Number(url.searchParams.get("start") ?? 0);
    const span = Number(url.searchParams.get("span") ?? 100);
    return new Response(
      JSON.stringify({ status: "ok", data: { item: rows.slice(start, start + span), count: rows.length } }),
      { headers: { "content-type": "application/json" } },
    );
  };
  return requests;
}

test("MCP list, pagination and search exclude archives with correct counts and explicit inclusion", async () => {
  const f = fixture();
  platformWorks();
  const normal = (await f.call("works_list")) as { itemId: string }[];
  assert.deepEqual(
    normal.map((item) => item.itemId),
    ["2", "4"],
  );
  const all = (await f.call("works_list", { includeArchived: true })) as { itemId: string }[];
  assert.equal(all.length, 4);
  const references = (await f.call("works_searchReferences", { query: "作品", kind: "related" })) as {
    itemId: string;
  }[];
  assert.deepEqual(
    references.map((item) => item.itemId),
    ["2", "4"],
  );
  const includedReferences = (await f.call("works_searchReferences", {
    query: "作品",
    kind: "related",
    includeArchived: true,
  })) as { itemId: string }[];
  assert.equal(includedReferences.length, 4);
  for (const method of ["works_page", "works_search"]) {
    const params = { page: 0, pageSize: 1, ...(method === "works_search" ? { query: "作品", kind: "name" } : {}) };
    const page = (await f.call(method, params)) as { items: { itemId: string }[]; total: number };
    assert.equal(page.total, 2);
    assert.equal(page.items[0]?.itemId, "2");
    const next = (await f.call(method, { ...params, page: 1 })) as typeof page;
    assert.equal(next.items[0]?.itemId, "4");
    const included = (await f.call(method, { ...params, includeArchived: true })) as typeof page;
    assert.equal(included.total, 4);
    assert.equal(included.items[0]?.itemId, "1");
  }
  const requests = platformWorks();
  assert.deepEqual(await f.call("works_search", { query: "1", kind: "id" }), { items: [], total: 0 });
  assert.equal(requests.length, 0);
  await assert.rejects(f.call("works_list", { includeArchived: "true" }), { kind: "validation" });
  await assert.rejects(f.call("works_list", { account: "b", includeArchived: true }), { kind: "forbidden" });
});

test("MCP detail and editor overrides are per call and never silently unlock later writes", async () => {
  const f = fixture();
  for (const method of ["works_get", "works_reviewFeedback", "works_editor"]) {
    await assert.rejects(f.call(method, { itemId: "1" }), { kind: "archived" });
    await f.call(method, { itemId: "1", includeArchived: true });
    await assert.rejects(f.call(method, { itemId: "1" }), { kind: "archived" });
  }
  assert.equal(f.counts.details, 2);
  assert.equal(f.counts.editor, 1);
  await assert.rejects(
    f.call("works_save", { itemId: "1", patch: { item_name: "新名称" }, idempotencyKey: "blocked" }),
    { kind: "archived" },
  );
  assert.equal(f.counts.save, 0);
  const saved = (await f.call("works_save", {
    itemId: "1",
    patch: { item_name: "新名称" },
    includeArchived: true,
    idempotencyKey: "allowed",
  })) as { state: string };
  assert.equal(saved.state, "succeeded");
  assert.equal(f.counts.save, 1);
  assert.equal(f.remote.fields.item_name, "新名称");
  assert.deepEqual(await f.call("works_archiveState"), ["1", "3"]);
});

test("MCP archive and restore share persistent UI state and obey idempotency and account scope", async () => {
  const f = fixture();
  const archived = (await f.call("works_archive", { itemId: "2", idempotencyKey: "archive" })) as { state: string };
  assert.equal(archived.state, "succeeded");
  assert.deepEqual(f.archives.get("a"), ["1", "3", "2"]);
  const events = f.events.length;
  await f.call("works_archive", { itemId: "2", idempotencyKey: "archive" });
  assert.equal(f.events.length, events);
  await f.call("works_restore", { itemId: "1", idempotencyKey: "restore" });
  assert.deepEqual(f.archives.get("a"), ["3", "2"]);
  await f.call("works_editor", { itemId: "1" });
  assert.deepEqual(f.create().get("a"), ["3", "2"]);
  assert.deepEqual(f.archives.get("b"), []);
  await assert.rejects(f.call("works_restore", { itemId: "2", account: "b", idempotencyKey: "wrong" }), {
    kind: "forbidden",
  });
});

test("an archive applied during editor loading stops writes before dispatch", async () => {
  const f = fixture();
  f.archives.set("a", "1", false);
  const editor = f.ports.editor;
  f.ports.editor = async (...args) => {
    const document = await editor(...args);
    f.archives.set("a", "1", true);
    return document;
  };
  await assert.rejects(
    f.call("works_save", { itemId: "1", patch: { item_name: "不能保存" }, idempotencyKey: "race" }),
    { kind: "archived" },
  );
  assert.equal(f.counts.save, 0);
});

test("explicit inclusion reaches real status operations without adding an unsupported platform field", async () => {
  const f = fixture();
  const wire: { url: string; method: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const method = init?.method ?? "GET";
    wire.push({ url: String(input), method });
    if (method !== "GET") assert.equal(JSON.parse(String(init?.body)).includeArchived, undefined);
    return new Response(
      JSON.stringify({ status: "ok", data: method === "GET" ? { item_name: "作品 1", status: "accept" } : null }),
      { headers: { "content-type": "application/json" } },
    );
  };
  const params = { itemId: "1", expectedStatus: "accept", idempotencyKey: "publish" };
  await assert.rejects(f.call("works_publish", params), { kind: "archived" });
  assert.equal(wire.length, 0);
  const result = (await f.call("works_publish", { ...params, includeArchived: true })) as { state: string };
  assert.equal(result.state, "succeeded");
  assert.deepEqual(
    wire.map((entry) => entry.method),
    ["GET", "PUT"],
  );
  assert.match(wire[1]?.url ?? "", /\/online$/);
});

test("a late archive during validation prevents a platform write", async () => {
  const f = fixture();
  f.archives.set("a", "1", false);
  f.ports.validate = async () => {
    f.archives.set("a", "1", true);
    return [];
  };
  await assert.rejects(f.call("works_save", { itemId: "1", patch: { item_name: "停止" }, idempotencyKey: "late" }), {
    kind: "archived",
  });
  assert.equal(f.counts.save, 0);
});
