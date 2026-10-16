import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import {
  type AccountSummary,
  emptyWorkCreateFields,
  isWorkCreateParams,
  type McpOperation,
  type McpPermission,
  mcpLevels,
  type WorkRecord,
} from "../packages/contracts/src";
import { Client } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { canonical, emptyMcpData, McpError, type McpPorts } from "../packages/mcp/src/model";
import { createMcpServer } from "../packages/mcp/src/server";
import { McpService } from "../packages/mcp/src/service";
import { buildWorkCreate, createWork } from "../packages/netease/src/endpoints/work-create";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Isolate creation, authorization and durable retries from real accounts and network writes */
function fixture(permissions: McpPermission[] = [...mcpLevels.full.permissions]) {
  const account: AccountSummary = {
    id: "create-test-account",
    nickname: "新增隔离测试",
    passport: null,
    avatarUrl: null,
    loginMethod: "cookie",
    lastLoginAt: 0,
    status: "active",
    current: true,
  };
  let durable = emptyMcpData();
  const creates: { fields: WorkRecord; submitReview: boolean }[] = [];
  const unused = async (): Promise<never> => {
    throw new Error("Unexpected adapter call");
  };
  const ports: McpPorts = {
    save: (data) => {
      durable = structuredClone(data);
    },
    changed: () => {},
    accounts: () => [account],
    assertEnabled: () => {},
    read: unused,
    editor: unused,
    options: unused,
    validate: async () => [],
    saveWork: unused,
    createWork: async (_draft, fields, beforeWrite, submitReview = false) => {
      beforeWrite();
      creates.push({ fields: structuredClone(fields), submitReview });
    },
    review: unused,
    pickFile: unused,
    upload: unused,
    assetRoot: join(tmpdir(), "glaze-mcp-create-unused"),
  };
  const service = new McpService(emptyMcpData(), ports);
  service.data.enabled = true;
  service.status = "running";
  service.accessWaitMs = 0;
  const client = service.registerClient("新增隔离测试 AI");
  service.connected(client.id, () => {});
  service.grant(client.id, { accounts: [account.id], defaultAccount: account.id, permissions });
  const call = (params: Record<string, unknown>) =>
    service.call(client.id, "works_create", params) as Promise<McpOperation>;
  return { service, client, ports, creates, call, durable: () => durable };
}

test("plain creation succeeds without an ID, does not submit review and allows another intentional creation", async () => {
  const f = fixture(["works:save"]);
  const args = { fields: { item_name: "作品甲" }, idempotencyKey: "create-a" };
  const created = await f.call(args);
  assert.equal(created.state, "succeeded");
  assert.equal(created.phase, "completed");
  assert.deepEqual(created.result, { created: true, submittedReview: false, itemId: null });
  assert.equal(f.creates[0]?.submitReview, false);
  assert.equal(f.service.data.drafts.length, 0);
  assert.equal(f.service.snapshot().requests.length, 0);
  assert.deepEqual(await f.call(args), created);
  assert.equal(f.creates.length, 1);
  assert.equal((await f.call({ ...args, idempotencyKey: "create-b" })).state, "succeeded");
  assert.equal(f.creates.length, 2);
});

test("creation and review use one create call and preserve their exact result across restart", async () => {
  const f = fixture();
  const args = { fields: { item_name: "新增并提审" }, submitReview: true, idempotencyKey: "create-review" };
  const created = await f.call(args);
  assert.equal(created.state, "succeeded");
  assert.equal(created.action, "create_review");
  assert.deepEqual(created.result, { created: true, submittedReview: true, itemId: null });
  assert.equal(f.creates.length, 1);
  assert.equal(f.creates[0]?.submitReview, true);
  assert.equal(f.service.snapshot().requests.length, 0);
  const restarted = new McpService(structuredClone(f.durable()), f.ports);
  restarted.status = "running";
  assert.deepEqual(await restarted.call(f.client.id, "works_create", args), created);
  assert.equal(f.creates.length, 1);
  await assert.rejects(f.call({ ...args, submitReview: false }), { kind: "conflict" });
});

test("the MCP SDK exposes the review choice and returns completed creation without an ID", async () => {
  const f = fixture();
  const client = new Client({ name: "新增协议测试", version: "1" });
  const server = createMcpServer(f.service, f.client.id);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tool = (await client.listTools()).tools.find((entry) => entry.name === "works_create");
    assert.ok(tool);
    assert.deepEqual(tool.inputSchema.properties?.submitReview, { default: false, type: "boolean" });
    const result = await client.callTool({
      name: "works_create",
      arguments: { fields: { item_name: "协议新增并提审" }, submitReview: true, idempotencyKey: "sdk-create" },
    });
    assert.equal(result.isError, undefined);
    const operation = result.structuredContent?.result as McpOperation;
    assert.equal(operation.state, "succeeded");
    assert.deepEqual(operation.result, { created: true, submittedReview: true, itemId: null });
    assert.equal(f.creates.length, 1);
    assert.equal(f.creates[0]?.submitReview, true);
  } finally {
    await client.close();
    await server.close();
  }
});

test("creation and review request both missing permissions together and consume one-time grants once", async () => {
  const f = fixture([]);
  f.service.accessWaitMs = 1000;
  const args = { fields: { item_name: "一次授权" }, submitReview: true, idempotencyKey: "once-create" };
  const pending = f.call(args);
  const request = f.service.snapshot().requests[0];
  assert.ok(request);
  assert.deepEqual(new Set(request.permissions), new Set(["works:save", "works:review"]));
  assert.equal(f.creates.length, 0);
  f.service.answer(request.id, "once");
  assert.equal((await pending).state, "succeeded");
  assert.equal(f.service.allowed(f.client.id, "works:save"), false);
  assert.equal(f.service.allowed(f.client.id, "works:review"), false);
  assert.equal((await f.call(args)).state, "succeeded");
  assert.equal(f.service.snapshot().requests.length, 0);
  const next = f.call({ ...args, idempotencyKey: "another-create" });
  const denied = assert.rejects(next, { kind: "forbidden" });
  const nextRequest = f.service.snapshot().requests[0];
  assert.ok(nextRequest);
  f.service.answer(nextRequest.id, "deny");
  await denied;
  assert.equal(f.creates.length, 1);
});

test("advance review permission applies to a single creation and review request", async () => {
  const f = fixture(["works:save"]);
  f.service.accessWaitMs = 1000;
  const access = f.service.call(f.client.id, "glaze_request_access", {
    permissions: ["works:review"],
    reason: "新增作品并提交审核",
  });
  const request = f.service.snapshot().requests[0];
  assert.ok(request);
  f.service.answer(request.id, "once");
  await access;
  const args = { fields: { item_name: "预先授权" }, submitReview: true, idempotencyKey: "advance-create" };
  assert.equal((await f.call(args)).state, "succeeded");
  assert.equal(f.service.allowed(f.client.id, "works:review"), false);
  f.service.accessWaitMs = 0;
  await assert.rejects(f.call({ ...args, idempotencyKey: "advance-create-2" }), { kind: "permission_pending" });
  assert.equal(f.creates.length, 1);
});

test("revoking review during validation prevents the combined create POST", async () => {
  const f = fixture();
  f.ports.validate = async () => {
    f.service.grant(f.client.id, {
      accounts: [f.client.defaultAccount],
      defaultAccount: f.client.defaultAccount,
      permissions: ["works:save"],
    });
    return [];
  };
  await assert.rejects(
    f.call({ fields: { item_name: "撤销授权" }, submitReview: true, idempotencyKey: "revoked-create" }),
    /授权/,
  );
  assert.equal(f.creates.length, 0);
});

for (const submitReview of [false, true]) {
  test(`uncertain creation submitReview=${submitReview} never retries or permits another create after restart`, async () => {
    const f = fixture();
    let posts = 0;
    f.ports.createWork = async (_draft, _fields, beforeWrite) => {
      beforeWrite();
      posts++;
      throw new McpError("timeout", "发送后连接中断");
    };
    const args = { fields: { item_name: "待核实创建" }, submitReview, idempotencyKey: "uncertain-create" };
    const result = await f.call(args);
    assert.equal(result.state, "unknown");
    assert.deepEqual(await f.call(args), result);
    await assert.rejects(f.call({ ...args, idempotencyKey: "new-key" }), /待核实/);
    const restarted = new McpService(structuredClone(f.durable()), f.ports);
    restarted.status = "running";
    await assert.rejects(
      restarted.call(f.client.id, "works_create", { ...args, idempotencyKey: "restart-key" }),
      /待核实/,
    );
    assert.equal(posts, 1);
  });
}

test("legacy creations awaiting ID reconciliation remain protected after upgrading", async () => {
  const f = fixture();
  f.ports.createWork = async (_draft, _fields, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "旧版待核实");
  };
  await f.call({ fields: { item_name: "历史创建" }, idempotencyKey: "legacy" });
  const data = structuredClone(f.durable());
  data.operations[0].state = "created_id_unresolved";
  data.operations[0].fingerprint = createHash("sha256")
    .update(
      canonical({
        name: "works_create",
        params: { fields: { item_name: "历史创建" }, idempotencyKey: "legacy", account: f.client.defaultAccount },
      }),
    )
    .digest("hex");
  const restarted = new McpService(data, f.ports);
  restarted.status = "running";
  const replayed = (await restarted.call(f.client.id, "works_create", {
    fields: { item_name: "历史创建" },
    idempotencyKey: "legacy",
  })) as McpOperation;
  assert.equal(replayed.state, "created_id_unresolved");
  await assert.rejects(
    restarted.call(f.client.id, "works_create", {
      fields: { item_name: "另一个作品" },
      idempotencyKey: "after-upgrade",
    }),
    /待核实/,
  );
});

test("deferred creation configuration is rejected before asking for any permission", async () => {
  const f = fixture([]);
  await assert.rejects(
    f.call({ fields: { item_name: "待后续配置", sync_pc_flag: true }, submitReview: true, idempotencyKey: "deferred" }),
    { kind: "validation" },
  );
  assert.equal(f.service.snapshot().requests.length, 0);
  assert.equal(f.creates.length, 0);
});

test("invalid review flags, forged wire flags and deferred configuration cannot create or submit a work", async () => {
  const f = fixture();
  for (const submitReview of ["true", 1, null])
    await assert.rejects(f.call({ fields: { item_name: "非法参数" }, submitReview, idempotencyKey: "invalid" }), {
      kind: "validation",
    });
  for (const fields of [
    { item_name: "伪造提审", is_check_apply: true },
    { item_name: "PC 同步", sync_pc_flag: true },
    { item_name: "折扣", discount: [{ price: 300 }] },
  ])
    await assert.rejects(f.call({ fields, idempotencyKey: "invalid-fields" }), { kind: "validation" });
  assert.equal(f.creates.length, 0);
  assert.equal(f.service.snapshot().requests.length, 0);
});

const constants = {
  pri_type: { pe: [{ id: 2, title: "add_ons" }], comp: [] },
  sub_type: { pe: { 2: [{ id: 4, title: "玩法" }] } },
  mod_second_type: { 2: [{ id: 7, title: "大型玩法" }] },
  mod_version: ["3.9"],
  label_type: {},
  item_tag_limit: 3,
  channel: { pe: [] },
  price_type: [{ id: "free", min: 0, max: 0, step: 0 }],
};

/** Build a complete new-work payload using synthetic signed receipts */
function validFields(): WorkRecord {
  return {
    ...emptyWorkCreateFields(),
    item_name: "新增协议测试",
    pri_type: 2,
    sub_type: 4,
    mod_second_type: 7,
    mod_version: "3.9",
    res: [
      { res_name: "test.zip", res_url: { body: "{}", sign: "TEST_ONLY", file_type: "zip_package" }, add_version: true },
    ],
  };
}

test("creation contracts accept only an explicit boolean review choice and reject a forged field flag", () => {
  const fields = validFields();
  assert.equal(isWorkCreateParams({ account: "a", fields }), true);
  assert.equal(isWorkCreateParams({ account: "a", fields, submitReview: true }), true);
  for (const submitReview of ["true", 1, null])
    assert.equal(isWorkCreateParams({ account: "a", fields, submitReview }), false);
  assert.equal(isWorkCreateParams({ account: "a", fields: { ...fields, is_check_apply: true } }), false);
  assert.equal(buildWorkCreate(fields).is_check_apply, false);
});

for (const submitReview of [false, true]) {
  test(`real create adapter submitReview=${submitReview} sends one POST without looking up an ID or a second review`, async () => {
    const requests: { url: string; method: string; body: unknown }[] = [];
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      requests.push({ url, method, body: init.body });
      return new Response(
        JSON.stringify({
          status: "ok",
          data: method === "POST" ? undefined : url.endsWith("/item-tag/") ? { tag_list: [] } : constants,
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    let guards = 0;
    assert.deepEqual(
      await createWork({ sessionCookie: "TEST_ONLY" }, { account: "a", fields: validFields(), submitReview }, () => {
        guards++;
      }),
      { ok: true, value: undefined },
    );
    const posts = requests.filter((request) => request.method === "POST");
    assert.equal(posts.length, 1);
    assert.ok(posts[0]?.url.endsWith("/items/categories/pe/upload"));
    assert.equal(JSON.parse(String(posts[0]?.body)).is_check_apply, submitReview);
    assert.equal(JSON.parse(String(posts[0]?.body)).mod_second_type, 7);
    assert.equal(guards, 1);
    assert.equal(
      requests.some(
        (request) => request.url.includes("apply_review") || /\/items\/categories\/pe\/\?/.test(request.url),
      ),
      false,
    );
  });
}
