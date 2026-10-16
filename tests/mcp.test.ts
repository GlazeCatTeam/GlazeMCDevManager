import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  type AccountSummary,
  emptyWorkCreateFields,
  type McpDraft,
  type McpOperation,
  mcpPermissions,
} from "../packages/contracts/src";
import { Client } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { resolveMaterial, snapshotMaterial, verifyMaterial } from "../packages/mcp/src/assets";
import { emptyMcpData, McpError, type McpPorts } from "../packages/mcp/src/model";
import { createMcpServer, McpPipeServer } from "../packages/mcp/src/server";
import { McpService } from "../packages/mcp/src/service";

/** Build an isolated service with explicit network stubs and a durable-state spy */
function fixture() {
  const account: AccountSummary = {
    id: "a",
    nickname: "测试账号",
    passport: null,
    avatarUrl: null,
    loginMethod: "cookie",
    lastLoginAt: 0,
    status: "active",
    current: true,
  };
  const accounts: [AccountSummary, AccountSummary] = [
    account,
    { ...account, id: "b", nickname: "第二账号", current: false },
  ];
  const remote = {
    itemId: "123",
    status: "init" as const,
    version: "1",
    modCode: "",
    guides: [],
    fields: { ...emptyWorkCreateFields(), item_name: "原名称" },
  };
  const counts = { save: 0, create: 0, review: 0, upload: 0 };
  let durable = emptyMcpData();
  const ports: McpPorts = {
    save: (data) => {
      durable = structuredClone(data);
    },
    changed: () => {},
    accounts: () => accounts,
    assertEnabled: () => {},
    read: async (_method, params) => params,
    editor: async () => structuredClone(remote),
    options: async () => {
      throw new Error("unused");
    },
    validate: async () => [],
    saveWork: async (_draft, patch, guard) => {
      guard();
      assert.equal(durable.operations[0]?.phase, "saving");
      counts.save++;
      Object.assign(remote.fields, patch);
    },
    createWork: async (_draft, _fields, guard) => {
      guard();
      counts.create++;
    },
    review: async (_account, _id, _expected, guard) => {
      guard();
      counts.review++;
      return { needCheckApply: false, queueLength: 0 };
    },
    pickFile: async () => null,
    upload: async () => {
      counts.upload++;
      return {
        name: "a.png",
        size: 1,
        url: "https://x.nosdn.127.net/a.png",
        receipt: { body: "{}", sign: "host-only", file_type: "image" },
      };
    },
    assetRoot: join(tmpdir(), "glaze-mcp-test-unused"),
  };
  const service = new McpService(emptyMcpData(), ports);
  service.data.enabled = true;
  service.status = "running";
  const client = service.invite("测试 AI");
  service.connected(client.id, () => {});
  service.grant(client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  const call = (name: string, params: unknown = {}) => service.call(client.id, name, params);
  const draft = async (key = "draft") =>
    (await call("works_draft_create", { itemId: "123", idempotencyKey: key })) as McpDraft;
  return { service, client, ports, remote, accounts, counts, call, draft, durable: () => durable };
}

test("unpaired clients see no tools; grants remain fixed when the UI account switches", async () => {
  const f = fixture();
  const pending = f.service.invite("未授权");
  assert.equal(f.service.tools(pending.id).length, 0);
  await assert.rejects(f.service.call(pending.id, "works_list", {}), /批准/);
  f.accounts[0].current = false;
  f.accounts[1].current = true;
  assert.deepEqual(await f.call("works_list"), { account: "a" });
  await assert.rejects(f.call("works_list", { account: "b" }), /账号未授权/);
  assert.equal(((await f.call("account_list")) as unknown[]).length, 1);
  assert.equal(JSON.stringify(f.service.snapshot()).includes(f.client.token), false);
  assert.equal(
    f.service.definitions.some((tool) => /login|cookie|logout|delete|settle/.test(tool.name)),
    false,
  );
});

test("runtime schemas reject invalid parameters and unknown fields", async () => {
  const f = fixture();
  await assert.rejects(f.call("works_get", { itemId: "../../123" }), /validation|Invalid|string/);
  await assert.rejects(f.call("works_list", { confirm: true }), /Unrecognized/);
  assert.equal(f.counts.save, 0);
});

test("a write cannot execute before approval and retries reuse the same operation", async () => {
  const f = fixture();
  const draft = await f.draft();
  const changed = (await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "basic",
    patch: { item_name: "新名称" },
  })) as McpDraft;
  const params = { draftId: draft.id, revision: changed.revision, idempotencyKey: "save", submitReview: false };
  const operation = (await f.call("works_save", params)) as McpOperation;
  assert.equal(f.counts.save, 0);
  assert.equal(operation.state, "pending");
  await f.service.decide(operation.id, changed.revision, true);
  assert.equal(f.counts.save, 1);
  assert.equal(f.remote.fields.item_name, "新名称");
  assert.equal(((await f.call("works_save", params)) as McpOperation).id, operation.id);
  assert.equal(f.counts.save, 1);
  await assert.rejects(f.service.decide(operation.id, changed.revision, true), /已处理/);
});

test("host edits invalidate old approvals and stale draft versions", async () => {
  const f = fixture();
  const draft = await f.draft();
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 1,
    idempotencyKey: "save",
  })) as McpOperation;
  f.service.editDraft(draft.id, 1, { item_name: "用户修改" });
  assert.equal(f.service.snapshot().operations[0]?.state, "expired");
  await assert.rejects(f.service.decide(operation.id, 1, true), /已处理/);
  await assert.rejects(
    f.call("works_draft_patch", { draftId: draft.id, revision: 1, section: "basic", patch: { item_name: "旧版本" } }),
    /版本已变化/,
  );
});

test("foreign drafts, forged receipts, unknown media URLs and script HTML are rejected or cleaned", async () => {
  const f = fixture();
  const draft = await f.draft();
  const second = f.service.invite("另一个 AI");
  f.service.connected(second.id, () => {});
  f.service.grant(second.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  await assert.rejects(f.service.call(second.id, "works_draft_preview", { draftId: draft.id }), /不属于/);
  await assert.rejects(
    f.call("works_draft_patch", {
      draftId: draft.id,
      revision: 1,
      section: "images",
      patch: { channel: [{ channel_id: 1, channel_url: { sign: "fake", body: "{}", file_type: "image" } }] },
    }),
    /签名/,
  );
  await assert.rejects(
    f.call("works_draft_patch", {
      draftId: draft.id,
      revision: 1,
      section: "banner",
      patch: { banner_pic: "https://evil.invalid/file" },
    }),
    /媒体必须/,
  );
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "detail",
    patch: { info: '<p onclick="evil()">内容<script>evil()</script></p>' },
  });
  assert.equal(f.service.snapshot().drafts[0]?.previewFields?.info, "<p>内容</p>");
});

test("save then review records each phase and stops after content changes", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "basic",
    patch: { item_name: "新名称" },
  });
  const normal = f.ports.saveWork;
  f.ports.saveWork = async (...args) => {
    await normal(...args);
    f.remote.fields.update_summary = "其他客户端改动";
  };
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "both",
    submitReview: true,
  })) as McpOperation;
  await f.service.decide(operation.id, 2, true);
  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.review, 0);
  assert.equal(f.service.snapshot().operations[0]?.state, "failed");
  assert.match(f.service.snapshot().operations[0]?.message ?? "", /保存已成功/);
  const restarted = new McpService(f.durable(), f.ports);
  assert.equal(restarted.snapshot().drafts[0]?.locked, true);
});

test("save and review succeeds once with a fixed approved snapshot", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "basic",
    patch: { item_name: "新名称" },
  });
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "both",
    submitReview: true,
  })) as McpOperation;
  await f.service.decide(operation.id, 2, true);
  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.review, 1);
  assert.equal(f.service.snapshot().operations[0]?.state, "succeeded");
});

test("revocation during validation stops the write at the adapter boundary", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "basic",
    patch: { item_name: "新名称" },
  });
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "save",
  })) as McpOperation;
  f.ports.saveWork = async (_draft, _patch, guard) => {
    f.service.revoke(f.client.id);
    guard();
    f.counts.save++;
  };
  await f.service.decide(operation.id, 2, true);
  assert.equal(f.counts.save, 0);
  assert.equal(f.service.snapshot().operations[0]?.state, "failed");
});

test("unknown results lock drafts; restart preserves unknown writes and expires pending approvals", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "basic",
    patch: { item_name: "新名称" },
  });
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "save",
  })) as McpOperation;
  f.ports.saveWork = async (_draft, _patch, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "超时");
  };
  await f.service.decide(operation.id, 2, true);
  assert.equal(f.service.snapshot().operations[0]?.state, "unknown");
  await assert.rejects(f.call("works_save", { draftId: draft.id, revision: 2, idempotencyKey: "retry" }), /待核实/);
  const copy = f.durable();
  assert.ok(copy.operations[0]);
  copy.operations[0].state = "running";
  const restarted = new McpService(copy, f.ports);
  assert.equal(restarted.snapshot().operations[0]?.state, "unknown");
});

test("creation without an ID returns unresolved and cannot accidentally submit review", async () => {
  const f = fixture();
  const draft = (await f.call("works_draft_create", { idempotencyKey: "new" })) as McpDraft;
  const operation = (await f.call("works_create", {
    draftId: draft.id,
    revision: 1,
    idempotencyKey: "create",
  })) as McpOperation;
  await f.service.decide(operation.id, 1, true);
  assert.equal(f.service.snapshot().operations[0]?.state, "created_id_unresolved");
  assert.equal(f.counts.create, 1);
  assert.equal(f.counts.review, 0);
});

test("logout, disable, rejection, expiration and financial permission changes are enforced", async () => {
  const f = fixture();
  const draft = await f.draft();
  const request = async (key: string) =>
    (await f.call("works_save", { draftId: draft.id, revision: 1, idempotencyKey: key })) as McpOperation;
  const rejected = await request("reject");
  await f.service.decide(rejected.id, 1, false);
  assert.equal(f.service.snapshot().operations[0]?.state, "rejected");
  await request("expire");
  assert.ok(f.service.data.operations[0]);
  f.service.data.operations[0].expiresAt = 0;
  assert.equal(f.service.snapshot().operations[0]?.state, "expired");
  await request("logout");
  f.accounts[0].status = "expired";
  f.service.accountsChanged();
  f.accounts[0].status = "active";
  assert.equal(f.service.snapshot().operations[0]?.state, "expired");
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: ["netease:works.read"] });
  await assert.rejects(f.call("income_list", { platform: "pe" }), /权限/);
  f.service.disable();
  await assert.rejects(f.call("works_list"), /服务已关闭/);
});

test("material import bounds paths and keeps a stable copy after the source changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-material-"));
  try {
    const source = join(root, "allowed");
    const outside = join(root, "outside");
    await mkdir(source);
    await mkdir(outside);
    await writeFile(join(source, "a.zip"), "original");
    await writeFile(join(outside, "b.zip"), "outside");
    assert.equal(await resolveMaterial(source, "a.zip"), join(source, "a.zip"));
    await assert.rejects(resolveMaterial(source, "../outside/b.zip"), /授权目录/);
    await assert.rejects(resolveMaterial(source, "a.zip:secret"), /授权目录/);
    await symlink(outside, join(source, "escape"), "junction");
    await assert.rejects(resolveMaterial(source, "escape/b.zip"), /链接|越界/);
    const asset = await snapshotMaterial(join(root, "snapshots"), join(source, "a.zip"), {
      draftId: "draft",
      kind: "resource",
      platform: "pe",
    });
    await writeFile(join(source, "a.zip"), "changed");
    await verifyMaterial(asset);
    assert.equal(await readFile(asset.path, "utf8"), "original");
    await writeFile(asset.path, "tampered");
    await assert.rejects(verifyMaterial(asset), /变化/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SDK negotiates protocol, lists tools and returns typed tool errors", async () => {
  const f = fixture();
  const server = createMcpServer(f.service, f.client.id);
  const client = new Client({ name: "test-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a);
    await client.connect(b);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "works_draft_create"));
    assert.ok(tools.tools.every((tool) => tool.inputSchema.type === "object"));
    const success = await client.callTool({ name: "works_list", arguments: {} });
    assert.deepEqual(success.structuredContent, { result: { account: "a" } });
    const denied = await client.callTool({ name: "works_list", arguments: { account: "b" } });
    assert.equal(denied.isError, true);
    const resources = await client.listResources();
    assert.equal(resources.resources[0]?.uri, "glaze://connection");
  } finally {
    await client.close();
    await server.close();
  }
});

test("Windows pipe authenticates the client before accepting MCP messages", {
  skip: process.platform !== "win32",
}, async () => {
  const f = fixture();
  const pipe = new McpPipeServer(f.service);
  const endpoint = await pipe.start();
  const socket = createConnection(endpoint);
  try {
    const reply = new Promise<string>((resolve, reject) => {
      socket.once("data", (data) => resolve(data.toString()));
      socket.once("error", reject);
    });
    socket.write(`${JSON.stringify({ clientId: f.client.id, token: f.client.token })}\n`);
    assert.equal(await reply, "OK\n");
  } finally {
    socket.destroy();
    await pipe.stop();
  }
});

test("new drafts cannot bypass unresolved writes until a human reconciles them", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", { draftId: draft.id, revision: 1, section: "basic", patch: { item_name: "修改" } });
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "write",
  })) as McpOperation;
  f.ports.saveWork = async (_draft, _patch, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "超时");
  };
  await f.service.decide(operation.id, 2, true);
  const second = await f.draft("second");
  await assert.rejects(
    f.call("works_save", { draftId: second.id, revision: 1, idempotencyKey: "new-write" }),
    /待核实/,
  );
  f.service.resolveOperation(operation.id);
  assert.equal(
    (
      (await f.call("works_save", {
        draftId: second.id,
        revision: 1,
        idempotencyKey: "after-human-check",
      })) as McpOperation
    ).state,
    "pending",
  );
  assert.equal(f.service.snapshot().drafts.find((entry) => entry.id === draft.id)?.locked, true);
});

test("review treats a host upload receipt and its returned media URL as the same approved content", async () => {
  const f = fixture();
  const draft = await f.draft();
  const url = "https://x.nosdn.127.net/a.png";
  f.service.data.assets.push({
    id: "material",
    draftId: draft.id,
    name: "a.png",
    size: 1,
    hash: "hash",
    kind: "image",
    platform: "pe",
    uploaded: true,
    expiresAt: Date.now() + 60000,
    path: "unused",
    receipt: {
      name: "a.png",
      size: 1,
      url,
      receipt: { body: JSON.stringify({ url }), sign: "host-only", file_type: "image" },
    },
  });
  await f.call("works_draft_patch", {
    draftId: draft.id,
    revision: 1,
    section: "images",
    patch: { channel: [{ channel_id: 1, channel_url: { $asset: "material", as: "receipt" } }] },
  });
  const save = f.ports.saveWork;
  f.ports.saveWork = async (...args) => {
    await save(...args);
    f.remote.fields.channel = [{ channel_id: 1, channel_url: url }];
  };
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "media-review",
    submitReview: true,
  })) as McpOperation;
  await f.service.decide(operation.id, 2, true);
  assert.equal(f.service.snapshot().operations[0]?.state, "succeeded");
  assert.equal(f.counts.review, 1);
  const publicDraft = await f.call("works_draft_preview", { draftId: draft.id });
  assert.equal(JSON.stringify(publicDraft).includes("host-only"), false);
});
