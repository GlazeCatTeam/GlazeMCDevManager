import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { LogService } from "../apps/desktop/src/main/logs/service";
import { createMcpApplication, type NavigationWindow } from "../apps/desktop/src/main/mcp/application";
import { createMcpBusiness } from "../apps/desktop/src/main/mcp/business";
import { withoutTomlServer } from "../apps/desktop/src/main/mcp/installers";
import { PluginToolCalls } from "../apps/desktop/src/main/mcp/plugin-calls";
import { type BuiltinPlugin, PluginRegistry } from "../apps/desktop/src/main/plugins/registry";
import { discoverPluginTools } from "../apps/desktop/src/main/plugins/tools";
import { createApplicationActions } from "../apps/desktop/src/main/preferences/actions";
import { AppearanceService } from "../apps/desktop/src/main/preferences/appearance";
import { CacheService } from "../apps/desktop/src/main/preferences/cache";
import { GeneralService } from "../apps/desktop/src/main/preferences/general";
import { SessionSettingsService } from "../apps/desktop/src/main/preferences/session-settings";
import { SessionManager } from "../apps/desktop/src/main/session/session-manager";
import {
  type AccountSummary,
  capabilities,
  defaultAppearance,
  defaultGeneral,
  defaultRankingBoards,
  defaultSessionSettings,
  emptyWorkCreateFields,
  type McpDraft,
  type McpOperation,
  mcpLevelOf,
  mcpLevels,
  mcpPermissions,
  type PluginManifest,
  type PluginToolCall,
  pluginToolName,
  validatePluginTools,
} from "../packages/contracts/src";
import { Client } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";
import { InMemoryTransport } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { ToolListChangedNotificationSchema } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js";
import { appTools } from "../packages/mcp/src/app-tools";
import { resolveLocalMaterial, resolveMaterial, snapshotMaterial, verifyMaterial } from "../packages/mcp/src/assets";
import { emptyMcpData, McpError, type McpPorts, parseMcpData } from "../packages/mcp/src/model";
import { createMcpServer, McpHttpServer } from "../packages/mcp/src/server";
import { McpService } from "../packages/mcp/src/service";
import { legacyToolDefinitions } from "../packages/mcp/src/tools";
import type { PreferenceStore } from "../packages/storage/src";
import { themeFixture } from "./fixtures/theme-package.mjs";

/** Build an isolated service with explicit network stubs and a durable-state spy */
function fixture(legacy = true, recentOperationLimit = 5000) {
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
    upload: async (_draft, _asset, guard) => {
      guard();
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
  const service = new McpService(emptyMcpData(), ports, recentOperationLimit);
  // Report missing permissions immediately instead of waiting for a user answer
  service.accessWaitMs = 0;
  // Retain regression coverage of the internal snapshot executor; production publishes direct tools only
  if (legacy) service.definitions.splice(0, service.definitions.length, ...legacyToolDefinitions());
  service.data.enabled = true;
  service.status = "running";
  const client = service.registerClient("测试 AI");
  service.connected(client.id, () => {});
  service.grant(client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  const call = (name: string, params: unknown = {}) => service.call(client.id, name, params);
  const draft = async (key = "draft") =>
    (await call("works_draft_create", { itemId: "123", idempotencyKey: key })) as McpDraft;
  return { service, client, ports, remote, accounts, counts, call, draft, durable: () => durable };
}

/** Build synthetic plugin manifests independent of concurrently edited bundled plugins */
function pluginManifest(): PluginManifest {
  return {
    id: "test.analytics",
    name: "测试分析",
    version: "1.0.0",
    description: "隔离测试插件",
    permissions: [
      "netease:analytics.read",
      "netease:messages.write",
      "netease:income.read",
      "storage",
      "netease:account.manage",
    ],
    contributes: {
      tools: [
        {
          id: "summary",
          title: "测试汇总",
          description: "返回筛选后的汇总",
          permission: "netease:analytics.read",
          risk: "read",
          input: {
            type: "object",
            properties: {
              count: { type: "integer", minimum: 1, maximum: 3 },
              mode: { type: "string", enum: ["all", "top"], maxLength: 3 },
              ratio: { type: "number", minimum: 0, maximum: 1, enum: [0, 0.5, 1] },
              tags: { type: "array", items: { type: "string", maxLength: 3 }, maxItems: 2 },
              active: { type: "boolean" },
              draftId: { type: "string", maxLength: 20 },
            },
            required: ["count"],
          },
        },
        {
          id: "update",
          title: "测试更新",
          description: "执行一次更新",
          permission: "netease:messages.write",
          risk: "write",
          input: { type: "object", properties: { text: { type: "string", maxLength: 10 } }, required: ["text"] },
        },
      ],
    },
  };
}

/** Wire the real dispatcher to a fake main window and configurable renderer replies */
function pluginFixture(timeoutMs = 30_000) {
  const f = fixture(false);
  const manifest = pluginManifest();
  const warnings: string[] = [];
  const definitions = discoverPluginTools([manifest], (message) => warnings.push(message));
  const calls: PluginToolCall[] = [];
  const state = { enabled: true, window: true, reply: true, error: "", beforeSend: () => {} };
  const dispatcher = new PluginToolCalls(
    () =>
      state.window
        ? {
            id: 7,
            send: (call) => {
              calls.push(call);
              state.beforeSend();
              if (state.reply)
                dispatcher.result(
                  7,
                  state.error
                    ? { callId: call.callId, ok: false, error: state.error }
                    : {
                        callId: call.callId,
                        ok: true,
                        value: {
                          value: call.params,
                          account: call.account,
                          token: "secret",
                          nested: { cookie: "secret", count: 1 },
                        },
                      },
                );
            },
          }
        : null,
    (id, permission) => f.service.allowed(id, permission),
    timeoutMs,
  );
  f.ports.assertEnabled = (method) => {
    if (method.startsWith("plugin:") && !state.enabled) throw new McpError("forbidden", "对应插件已停用");
  };
  f.ports.invokePlugin = (id, tool, params, guard, beforeWrite) =>
    dispatcher.invoke(id, tool, params, guard, beforeWrite);
  f.service.setPluginTools(definitions);
  return { ...f, manifest, definitions, warnings, calls, state, dispatcher };
}

test("plugin contributions expose strict schemas, annotations, descriptions and sanitized results over MCP", async () => {
  const f = pluginFixture();
  assert.deepEqual(f.warnings, []);
  assert.equal(pluginToolName(f.manifest.id, "summary"), "plugin_analytics_summary");
  assert.ok(f.service.tools(f.client.id).some((tool) => tool.name === "plugin_analytics_summary"));
  const server = createMcpServer(f.service, f.client.id);
  const client = new Client({ name: "Plugin test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    const list = (await client.listTools()).tools;
    const read = list.find((tool) => tool.name === "plugin_analytics_summary");
    assert.ok(read);
    assert.match(read.description ?? "", /来自插件「测试分析」/);
    assert.equal(read.annotations?.readOnlyHint, true);
    assert.equal(list.find((tool) => tool.name === "plugin_analytics_update")?.annotations?.readOnlyHint, false);
    assert.equal(read.inputSchema.additionalProperties, false);
    const result = await client.callTool({
      name: read.name,
      arguments: { count: 2, ratio: 0.5, draftId: "plugin-owned" },
    });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.stringify(result).includes("secret"), false);
    assert.equal(f.calls[0]?.account, "a");
    assert.deepEqual(f.calls[0]?.params, { count: 2, ratio: 0.5, draftId: "plugin-owned" });
    assert.equal(f.service.data.audit[0]?.title, "测试汇总");
  } finally {
    await client.close();
    await server.close();
    f.dispatcher.close();
  }
});

test("plugin schemas reject unknown, missing, enum, range, length and account violations", async () => {
  const f = pluginFixture();
  for (const input of [
    {},
    { count: 0 },
    { count: 4 },
    { count: 1.5 },
    { count: 1, extra: true },
    { count: 1, mode: "bad" },
    { count: 1, ratio: 0.3 },
    { count: 1, ratio: 2 },
    { count: 1, tags: ["long"] },
    { count: 1, tags: ["a", "b", "c"] },
    { count: 1, tags: [1] },
    { count: 1, active: "yes" },
  ])
    await assert.rejects(f.call("plugin_analytics_summary", input), (error: McpError) => error.kind === "validation");
  await assert.rejects(
    f.call("plugin_analytics_update", { text: "write" }),
    (error: McpError) => error.kind === "validation",
  );
  await assert.rejects(f.call("plugin_analytics_summary", { count: 1, account: "b" }), /账号未授权/);
  assert.equal(f.calls.length, 0);
  await f.call("plugin_analytics_summary", { count: 1, mode: "all", tags: ["a"], active: true });
  assert.equal(f.calls.length, 1);
});

test("plugin permission requests preserve one-time grants and intersect manifest permissions at dispatch", async () => {
  const f = pluginFixture();
  f.service.grant(f.client.id, {
    accounts: ["a"],
    defaultAccount: "a",
    permissions: ["netease:account.read", "netease:income.read"],
  });
  await assert.rejects(
    f.call("plugin_analytics_summary", { count: 0 }),
    (error: McpError) => error.kind === "validation",
  );
  assert.equal(f.service.requestCount(), 0);
  const listed = f.service.catalog(f.client.id).find((entry) => entry.tool.name === "plugin_analytics_summary");
  assert.equal(listed?.granted, false);
  await assert.rejects(
    f.call("plugin_analytics_summary", { count: 1 }),
    (error: McpError) => error.kind === "permission_pending",
  );
  const request = f.service.snapshot().requests[0];
  assert.ok(request);
  assert.match(request.reason, /测试汇总/);
  f.service.answer(request.id, "once");
  await f.call("plugin_analytics_summary", { count: 1 });
  assert.deepEqual(new Set(f.calls[0]?.permissions), new Set(["netease:analytics.read", "netease:income.read"]));
  assert.equal(f.service.allowed(f.client.id, "netease:analytics.read"), false);
  await assert.rejects(
    f.call("plugin_analytics_summary", { count: 1 }),
    (error: McpError) => error.kind === "permission_pending",
  );
});

test("disabled and replaced plugin tools disappear and cannot finish stale calls", async () => {
  const f = pluginFixture();
  f.state.enabled = false;
  assert.equal(
    f.service.tools(f.client.id).some((tool) => tool.plugin),
    false,
  );
  assert.equal(
    f.service.catalog(f.client.id).some(({ tool }) => tool.plugin),
    false,
  );
  await assert.rejects(f.call("plugin_analytics_summary", { count: 1 }), /停用/);
  f.state.enabled = true;
  f.state.beforeSend = () => {
    f.state.enabled = false;
  };
  await assert.rejects(f.call("plugin_analytics_summary", { count: 1 }), /停用/);
  f.state.enabled = true;
  f.state.beforeSend = () => f.service.setPluginTools([]);
  await assert.rejects(f.call("plugin_analytics_summary", { count: 1 }), /已变更/);
  assert.equal(f.service.data.audit[0]?.title, "测试汇总");
  await assert.rejects(f.call("plugin_analytics_summary", { count: 1 }), /不存在/);
});

test("plugin tool replacements notify connected HTTP clients and refresh their list", async () => {
  const f = pluginFixture();
  const http = new McpHttpServer(f.service);
  const endpoint = await http.start(0);
  f.ports.changed = () => http.changed();
  const client = new Client({ name: "Plugin refresh", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
    const entry = f.service.data.clients.find((item) => item.name === "Plugin refresh");
    assert.ok(entry);
    f.service.grant(entry.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
    assert.ok((await client.listTools()).tools.some((tool) => tool.name === "plugin_analytics_summary"));
    let notifications = 0;
    client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      notifications++;
    });
    f.service.setPluginTools([]);
    for (let n = 0; n < 30 && !notifications; n++) await delay(10);
    assert.ok(notifications > 0);
    assert.equal(
      (await client.listTools()).tools.some((tool) => tool.name.startsWith("plugin_")),
      false,
    );
    f.service.setPluginTools(f.definitions);
    assert.ok((await client.listTools()).tools.some((tool) => tool.name === "plugin_analytics_summary"));
  } finally {
    await client.close();
    await http.stop();
  }
});

test("plugin dispatcher rejects unknown, malformed, foreign, duplicate and late result IDs", async () => {
  const f = pluginFixture();
  f.state.reply = false;
  const pending = f.call("plugin_analytics_summary", { count: 1 });
  await delay(0);
  const callId = f.calls[0]?.callId;
  assert.ok(callId);
  try {
    for (const input of [
      null,
      [],
      {},
      { callId, ok: "true", value: 1 },
      { callId, ok: true },
      { callId, ok: false, error: 1 },
      { callId, ok: true, value: 1, extra: true },
    ])
      assert.throws(
        () => f.dispatcher.result(7, input),
        (error: McpError) => error.kind === "validation",
      );
    assert.throws(() => f.dispatcher.result(8, { callId, ok: true, value: 1 }), /窗口不匹配/);
    assert.throws(() => f.dispatcher.result(7, { callId: "unknown", ok: true, value: 1 }), /不存在/);
    f.dispatcher.result(7, { callId, ok: true, value: { safe: true, password: "secret" } });
    assert.deepEqual(await pending, { safe: true });
    assert.throws(() => f.dispatcher.result(7, { callId, ok: true, value: 2 }), /已完成/);
  } finally {
    f.dispatcher.close();
  }
});

test("plugin errors, unavailable windows, timeouts and shutdown return explicit failures", async () => {
  const f = pluginFixture(5);
  f.state.error = "插件计算失败";
  await assert.rejects(
    f.call("plugin_analytics_summary", { count: 1 }),
    (error: McpError) => error.kind === "plugin" && error.message === "插件计算失败",
  );
  f.state.window = false;
  await assert.rejects(f.call("plugin_analytics_summary", { count: 1 }), /请先打开 Glaze 窗口/);
  f.state.window = true;
  f.state.reply = false;
  await assert.rejects(f.call("plugin_analytics_summary", { count: 1 }), /插件工具没有响应，请确认 Glaze 窗口已打开/);
  const late = f.calls.at(-1);
  assert.throws(() => f.dispatcher.result(7, { callId: late?.callId, ok: true, value: 1 }), /已完成/);
  const waiting = f.call("plugin_analytics_summary", { count: 1 });
  const rejected = assert.rejects(waiting, /服务已停止/);
  await delay(0);
  f.dispatcher.close();
  await rejected;
});

test("plugin writes persist before sending, deduplicate, retain titles and never retry unknown results", async () => {
  const f = pluginFixture(5);
  f.state.beforeSend = () => assert.equal(f.durable().operations[0]?.phase, "writing");
  const input = { text: "hello", idempotencyKey: "write" };
  const first = (await f.call("plugin_analytics_update", input)) as McpOperation;
  assert.equal(first.state, "succeeded");
  assert.equal(first.title, "测试更新");
  assert.deepEqual(f.calls[0]?.params, { text: "hello" });
  assert.equal(((await f.call("plugin_analytics_update", input)) as McpOperation).id, first.id);
  assert.equal(f.calls.length, 1);
  await assert.rejects(f.call("plugin_analytics_update", { ...input, text: "changed" }), /幂等键/);
  f.state.reply = false;
  const unknownInput = { ...input, idempotencyKey: "timeout" };
  const unknown = (await f.call("plugin_analytics_update", unknownInput)) as McpOperation;
  assert.equal(unknown.state, "unknown");
  assert.match(unknown.message, /禁止自动重试/);
  assert.equal(((await f.call("plugin_analytics_update", unknownInput)) as McpOperation).id, unknown.id);
  await assert.rejects(f.call("plugin_analytics_update", { ...input, idempotencyKey: "new" }), /待核实/);
  assert.equal(f.calls.length, 2);
  f.service.setPluginTools([]);
  assert.equal(f.service.snapshot().operations[0]?.title, "测试更新");
});

test("plugin guards stop revoked writes before dispatch and reject results after grant changes", async () => {
  const f = pluginFixture();
  const invoke = f.ports.invokePlugin;
  assert.ok(invoke);
  f.ports.invokePlugin = (id, tool, params, guard, beforeWrite) => {
    f.service.grant(id, { accounts: ["a"], defaultAccount: "a", permissions: [] });
    return invoke(id, tool, params, guard, beforeWrite);
  };
  await assert.rejects(f.call("plugin_analytics_update", { text: "test", idempotencyKey: "revoked" }), /权限|授权/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.service.data.operations[0]?.state, "failed");
  f.ports.invokePlugin = invoke;
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  f.state.beforeSend = () => f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [] });
  await assert.rejects(f.call("plugin_analytics_update", { text: "test", idempotencyKey: "in-flight" }), /权限|授权/);
  assert.equal(f.service.data.operations[0]?.state, "unknown");
});

test("plugin write failures distinguish explicit rejection from missing windows and service shutdown", async () => {
  const f = pluginFixture();
  f.state.error = "插件拒绝更新";
  const failed = (await f.call("plugin_analytics_update", {
    text: "test",
    idempotencyKey: "rejected",
  })) as McpOperation;
  assert.equal(failed.state, "failed");
  assert.equal(failed.message, "插件拒绝更新");
  f.state.window = false;
  const unavailable = (await f.call("plugin_analytics_update", {
    text: "test",
    idempotencyKey: "no-window",
  })) as McpOperation;
  assert.equal(unavailable.state, "failed");
  assert.match(unavailable.message, /窗口/);
  assert.equal(f.calls.length, 1);
  f.state.window = true;
  f.state.reply = false;
  f.ports.changed = () => {
    if (!f.service.data.enabled) f.dispatcher.close();
  };
  const waiting = f.call("plugin_analytics_update", { text: "test", idempotencyKey: "stop" });
  const rejected = assert.rejects(waiting, /服务已关闭/);
  await delay(0);
  f.service.disable();
  await rejected;
  assert.equal(f.service.data.operations[0]?.state, "unknown");
  assert.match(f.service.data.operations[0]?.message ?? "", /服务已停止.*禁止自动重试/);
  assert.throws(() => f.dispatcher.result(7, { callId: f.calls.at(-1)?.callId, ok: true, value: 1 }), /已完成/);
});

test("plugin contributions without input accept only optional account and writes stay isolated by account", async () => {
  const f = pluginFixture();
  const manifest = pluginManifest();
  for (const tool of manifest.contributes?.tools ?? []) delete tool.input;
  f.service.setPluginTools(discoverPluginTools([manifest], () => assert.fail("valid manifest")));
  await f.call("plugin_analytics_summary");
  assert.deepEqual(f.calls[0]?.params, {});
  await assert.rejects(f.call("plugin_analytics_summary", { extra: true }), /Unrecognized/);
  f.service.grant(f.client.id, { accounts: ["a", "b"], defaultAccount: "a", permissions: [...mcpPermissions] });
  const first = (await f.call("plugin_analytics_update", { idempotencyKey: "per-account" })) as McpOperation;
  const second = (await f.call("plugin_analytics_update", {
    account: "b",
    idempotencyKey: "per-account",
  })) as McpOperation;
  assert.notEqual(first.id, second.id);
  assert.equal(f.calls.at(-1)?.account, "b");
  assert.equal(f.client.defaultAccount, "a");
});

test("invalid plugin contributions are skipped with warnings while valid siblings remain registered", () => {
  const manifest = pluginManifest();
  const tools = manifest.contributes?.tools;
  assert.ok(tools?.[0]);
  tools.push({ ...tools[0], id: "invalid", permission: "netease:works.read" });
  tools.push({ ...tools[0], id: "reserved", input: { type: "object", properties: { account: { type: "string" } } } });
  tools.push({
    ...tools[0],
    id: "range",
    input: { type: "object", properties: { count: { type: "integer", minimum: 3, maximum: 1 } } },
  });
  const warnings: string[] = [];
  const definitions = discoverPluginTools([manifest], (message) => warnings.push(message));
  assert.deepEqual(
    definitions.map((tool) => tool.name),
    ["plugin_analytics_summary", "plugin_analytics_update"],
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /未在插件|保留|范围/);
  const duplicate = pluginManifest();
  duplicate.id = "other.analytics";
  assert.deepEqual(
    discoverPluginTools([pluginManifest(), duplicate], () => {}),
    [],
  );
});

test("plugin manifest validation rejects invalid ids, duplicate ids, metadata, permissions and input fields", () => {
  const manifest = pluginManifest();
  assert.deepEqual(validatePluginTools(manifest), []);
  const tool = manifest.contributes?.tools?.[0];
  assert.ok(tool);
  const invalid = [
    { ...tool, id: "Bad-id" },
    { ...tool, title: "" },
    { ...tool, description: "" },
    { ...tool, permission: "netease:works.read" },
    { ...tool, permission: "netease:messages.write" },
    { ...tool, permission: "works:draft" },
    { ...tool, risk: "dangerous" },
    { ...tool, input: { type: "array", properties: {} } },
    { ...tool, input: { type: "object", properties: { bad: { type: "object" } } } },
    { ...tool, input: { type: "object", properties: { bad: { type: "array", items: { type: "number" } } } } },
    { ...tool, input: { type: "object", properties: {}, required: ["missing"] } },
  ];
  for (const bad of invalid)
    assert.ok(validatePluginTools({ ...manifest, contributes: { tools: [bad] } } as PluginManifest).length > 0);
  assert.ok(
    validatePluginTools({ ...manifest, contributes: { tools: [tool, tool] } }).some((message) =>
      message.includes("重复"),
    ),
  );
});

test("unpaired clients see no tools; grants remain fixed when the UI account switches", async () => {
  const f = fixture();
  const pending = f.service.registerClient("未授权");
  assert.equal(f.service.tools(pending.id).length, 0);
  await assert.rejects(f.service.call(pending.id, "works_list", {}), /批准/);
  f.accounts[0].current = false;
  f.accounts[1].current = true;
  assert.deepEqual(await f.call("works_list"), { account: "a" });
  await assert.rejects(f.call("works_list", { account: "b" }), /账号未授权/);
  assert.equal(((await f.call("account_list")) as unknown[]).length, 1);
  assert.equal("token" in (f.service.snapshot().clients[0] ?? {}), false);
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

test("granted saves execute immediately and retries reuse the completed operation", async () => {
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
  assert.equal(operation.state, "succeeded");
  assert.equal(f.counts.save, 1);
  assert.equal(f.remote.fields.item_name, "新名称");
  assert.equal(((await f.call("works_save", params)) as McpOperation).id, operation.id);
  assert.equal(f.counts.save, 1);
  assert.equal(
    f.service.snapshot().operations.some((entry) => entry.state === "pending"),
    false,
  );
});

test("host edits and remote conflicts prevent stale writes without a confirmation dialog", async () => {
  const f = fixture();
  const draft = await f.draft();
  f.service.editDraft(draft.id, 1, { item_name: "用户修改" });
  await assert.rejects(f.call("works_save", { draftId: draft.id, revision: 1, idempotencyKey: "stale" }), /版本已变化/);
  f.remote.fields.item_name = "另一客户端已保存";
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "conflict",
  })) as McpOperation;
  assert.equal(operation.state, "failed");
  assert.match(operation.message, /平台内容已变化/);
  assert.equal(f.counts.save, 0);
});

test("foreign drafts, forged receipts, unknown media URLs and script HTML are rejected or cleaned", async () => {
  const f = fixture();
  const draft = await f.draft();
  const second = f.service.registerClient("另一个 AI");
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
  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.review, 0);
  assert.equal(operation.state, "failed");
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
  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.review, 1);
  assert.equal(operation.state, "succeeded");
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
  f.ports.saveWork = async (_draft, _patch, guard) => {
    f.service.revoke(f.client.id);
    guard();
    f.counts.save++;
  };
  await assert.rejects(f.call("works_save", { draftId: draft.id, revision: 2, idempotencyKey: "save" }), /批准|授权/);
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
  f.ports.saveWork = async (_draft, _patch, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "超时");
  };
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "save",
  })) as McpOperation;

  assert.equal(operation.state, "unknown");
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
  assert.equal(operation.state, "created_id_unresolved");
  assert.equal(f.counts.create, 1);
  assert.equal(f.counts.review, 0);
});

test("ungranted writes, expired accounts, disabled plugins and stopped service cannot execute", async () => {
  const f = fixture();
  const draft = await f.draft();
  const params = { draftId: draft.id, revision: 1, idempotencyKey: "denied" };
  f.service.grant(f.client.id, {
    accounts: ["a"],
    defaultAccount: "a",
    permissions: ["netease:works.read", "works:draft"],
  });
  await assert.rejects(f.call("works_save", params), /权限/);
  await assert.rejects(f.call("works_submit_review", params), /权限/);
  await assert.rejects(f.call("works_asset_upload", { ...params, assetId: "missing" }), /权限/);
  await assert.rejects(f.call("income_list", { platform: "pe" }), /权限/);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  f.accounts[0].status = "expired";
  f.service.accountsChanged();
  await assert.rejects(f.call("works_save", params), /过期/);
  f.accounts[0].status = "active";
  f.ports.assertEnabled = () => {
    throw new McpError("forbidden", "插件已停用");
  };
  await assert.rejects(f.call("works_save", params), /插件已停用/);
  f.service.disable();
  await assert.rejects(f.call("works_list"), /服务已关闭/);
  assert.deepEqual(f.counts, { save: 0, create: 0, review: 0, upload: 0 });
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
    // Windows runners may expose the temporary directory through an 8.3 short path
    assert.equal(await resolveMaterial(source, "a.zip"), await realpath(join(source, "a.zip")));
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

test("new drafts cannot bypass unresolved writes until a human reconciles them", async () => {
  const f = fixture();
  const draft = await f.draft();
  await f.call("works_draft_patch", { draftId: draft.id, revision: 1, section: "basic", patch: { item_name: "修改" } });
  f.ports.saveWork = async (_draft, _patch, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "超时");
  };
  const operation = (await f.call("works_save", {
    draftId: draft.id,
    revision: 2,
    idempotencyKey: "write",
  })) as McpOperation;

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
    "succeeded",
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
  assert.equal(operation.state, "succeeded");
  assert.equal(f.counts.review, 1);
  const publicDraft = await f.call("works_draft_preview", { draftId: draft.id });
  assert.equal(JSON.stringify(publicDraft).includes("host-only"), false);
});

test("HTTP SDK clients connect by URL, stay isolated and receive grant notifications", async () => {
  const f = fixture();
  const http = new McpHttpServer(f.service);
  const endpoint = await http.start(0);
  f.ports.changed = () => http.changed();
  const first = new Client({ name: "Codex", version: "1" });
  const second = new Client({ name: "Codex", version: "1" });
  const firstTransport = new StreamableHTTPClientTransport(new URL(endpoint));
  const secondTransport = new StreamableHTTPClientTransport(new URL(endpoint));
  try {
    await first.connect(firstTransport);
    await second.connect(secondTransport);
    assert.notEqual(firstTransport.sessionId, secondTransport.sessionId);
    const guide = ["glaze_status", "glaze_request_access"];
    assert.deepEqual(
      (await first.listTools()).tools.map((tool) => tool.name),
      guide,
    );
    assert.deepEqual(
      (await second.listTools()).tools.map((tool) => tool.name),
      guide,
    );
    const state = await first.readResource({ uri: "glaze://connection" });
    assert.equal(JSON.parse(state.contents[0]?.text as string).approved, false);
    const clients = f.service.snapshot().clients.filter((entry) => entry.name === "Codex");
    assert.equal(clients.length, 2);
    assert.ok(clients[0] && clients[1]);
    assert.ok(firstTransport.sessionId);
    let notified = false;
    first.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      notified = true;
    });
    f.service.grant(clients[0].id, { accounts: ["a"], defaultAccount: "a", permissions: ["netease:account.read"] });
    for (let attempt = 0; attempt < 20 && !notified; attempt++) await delay(10);
    assert.equal(notified, true);
    assert.ok((await first.listTools()).tools.some((tool) => tool.name === "account_list"));
    assert.deepEqual(
      (await second.listTools()).tools.map((tool) => tool.name),
      guide,
    );
    const accounts = await first.callTool({ name: "account_list", arguments: {} });
    assert.ok(accounts.structuredContent);
    assert.equal((accounts.structuredContent.result as AccountSummary[])[0]?.id, "a");
    assert.equal((await first.callTool({ name: "income_list", arguments: {} })).isError, true);
    f.service.revoke(clients[0].id);
    const revoked = await fetch(endpoint, {
      headers: { "mcp-session-id": firstTransport.sessionId, Accept: "text/event-stream" },
    });
    assert.equal(revoked.status, 404);
    await secondTransport.terminateSession();
    assert.equal(f.service.snapshot().clients.find((entry) => entry.id === clients[1]?.id)?.connected, false);
  } finally {
    await first.close();
    await second.close();
    await http.stop();
  }
  assert.equal(f.service.snapshot().endpoint, null);
  await assert.rejects(fetch(endpoint));
});

test("HTTP rejects invalid hosts, origins, routes, sessions and oversized input before registration", async () => {
  const f = fixture();
  const http = new McpHttpServer(f.service);
  const endpoint = await http.start(0);
  const initialCount = f.service.data.clients.length;
  try {
    for (const origin of ["https://evil.example", "null", "http://127.0.0.1:1"]) {
      assert.equal((await fetch(endpoint, { headers: { Origin: origin } })).status, 403);
    }
    const hostileHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(endpoint, { headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on("error", reject);
      req.end();
    });
    assert.equal(hostileHost, 403);
    assert.equal((await fetch(`${endpoint}/wrong`)).status, 404);
    assert.equal((await fetch(endpoint)).status, 400);
    assert.equal((await fetch(endpoint, { method: "OPTIONS" })).status, 405);
    assert.equal((await fetch(endpoint, { headers: { "mcp-session-id": "missing" } })).status, 404);
    assert.equal((await fetch(endpoint, { method: "POST", body: "{}" })).status, 415);
    for (const body of ["{", "{}", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })]) {
      assert.equal(
        (await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body })).status,
        400,
      );
    }
    assert.equal(
      (
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify("x".repeat(3 * 1024 * 1024)),
        })
      ).status,
      413,
    );
    assert.equal(f.service.data.clients.length, initialCount);
  } finally {
    await http.stop();
  }
});

test("HTTP port conflicts fail explicitly; stop and restart release sessions and retain the URL", async () => {
  const f = fixture();
  const first = new McpHttpServer(f.service);
  const other = new McpHttpServer(f.service);
  const endpoint = await first.start(0);
  const port = Number(new URL(endpoint).port);
  const client = new Client({ name: "Restart test", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  try {
    await assert.rejects(other.start(port), (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE");
    await client.connect(transport);
    const oldId = transport.sessionId;
    assert.ok(oldId);
    f.service.disable();
    await first.stop();
    f.service.data.enabled = true;
    f.service.status = "running";
    assert.equal(await first.start(port), endpoint);
    assert.equal((await fetch(endpoint, { headers: { "mcp-session-id": oldId } })).status, 404);
  } finally {
    await client.close();
    await first.stop();
    await other.stop();
  }
});

test("idle HTTP sessions release slots and new connections never inherit old grants", async () => {
  const f = fixture();
  const http = new McpHttpServer(f.service, 100);
  const endpoint = await http.start(0);
  const client = new Client({ name: "Idle client", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  try {
    await client.connect(transport);
    const entry = f.service.snapshot().clients.find((item) => item.name === "Idle client");
    assert.ok(entry);
    f.service.grant(entry.id, { accounts: ["a"], defaultAccount: "a", permissions: ["netease:account.read"] });
    for (let attempt = 0; attempt < 50 && f.service.connections.has(entry.id); attempt++) await delay(20);
    assert.equal(f.service.connections.has(entry.id), false);
    await client.close();
    const replacement = f.service.registerClient("Idle client");
    assert.equal(replacement.approved, false);
    assert.equal(
      f.service.snapshot().clients.some((item) => item.id === entry.id),
      false,
    );
  } finally {
    await client.close();
    await http.stop();
  }
});

test("SDK save performs the complete rename without UI calls and reports uncertain failures", async () => {
  const f = fixture();
  const server = createMcpServer(f.service, f.client.id);
  const client = new Client({ name: "Direct save test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const created = await client.callTool({
      name: "works_draft_create",
      arguments: { itemId: "123", idempotencyKey: "sdk-draft" },
    });
    const draft = created.structuredContent?.result as McpDraft;
    assert.ok(draft.id);
    await client.callTool({
      name: "works_draft_patch",
      arguments: { draftId: draft.id, revision: 1, section: "basic", patch: { item_name: "MCP测试作品" } },
    });
    const args = { draftId: draft.id, revision: 2, idempotencyKey: "sdk-save" };
    const saved = await client.callTool({ name: "works_save", arguments: args });
    assert.equal(saved.isError, undefined);
    assert.ok(saved.structuredContent);
    assert.equal((saved.structuredContent.result as McpOperation).state, "succeeded");
    assert.equal(f.remote.fields.item_name, "MCP测试作品");
    assert.equal(f.counts.save, 1);
    assert.equal(f.counts.review, 0);
    await client.callTool({ name: "works_save", arguments: args });
    assert.equal(f.counts.save, 1);
    await client.callTool({
      name: "works_draft_patch",
      arguments: { draftId: draft.id, revision: 3, section: "basic", patch: { item_name: "第二次修改" } },
    });
    f.ports.saveWork = async (_draft, _patch, beforeWrite) => {
      beforeWrite();
      throw new McpError("timeout", "超时");
    };
    const failed = await client.callTool({
      name: "works_save",
      arguments: { draftId: draft.id, revision: 4, idempotencyKey: "timeout" },
    });
    assert.equal(failed.isError, true);
    assert.ok(failed.structuredContent);
    assert.equal((failed.structuredContent.result as McpOperation).state, "unknown");
    assert.equal(
      f.service.snapshot().operations.some((op) => op.state === "pending"),
      false,
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test("granted material import and upload execute once without approval requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-direct-upload-"));
  const f = fixture();
  try {
    const path = join(root, "source.png");
    await writeFile(path, "test-material");
    f.ports.assetRoot = join(root, "snapshots");
    f.ports.pickFile = async () => path;
    const draft = await f.draft();
    const imported = (await f.call("works_asset_import", {
      draftId: draft.id,
      revision: 1,
      idempotencyKey: "import",
      kind: "image",
    })) as McpOperation;
    assert.equal(imported.state, "succeeded");
    assert.ok(imported.assetId);
    const args = { draftId: draft.id, revision: 1, idempotencyKey: "upload", assetId: imported.assetId };
    const uploaded = (await f.call("works_asset_upload", args)) as McpOperation;
    assert.equal(uploaded.state, "succeeded");
    await f.call("works_asset_upload", args);
    assert.equal(f.counts.upload, 1);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "glaze-mcp-direct-upload-")));
    await rm(root, { recursive: true, force: true });
  }
});

test("public MCP exposes direct business tools and rejects the removed draft API", async () => {
  const f = fixture(false);
  const names = f.service.tools(f.client.id).map((tool) => tool.name);
  assert.equal(
    names.some((name) => name.startsWith("works_draft_") || name.startsWith("works_asset_")),
    false,
  );
  for (const name of [
    "works_save",
    "works_create",
    "works_upload",
    "works_delete",
    "works_changePrice",
    "promotion_join",
    "promotion_saveBanner",
    "promotion_upload",
    "comments_reply",
    "feedback_reply",
    "messages_delete",
    "analytics_periodIncome",
  ])
    assert.ok(names.includes(name), name);
  await assert.rejects(f.call("works_draft_create", { idempotencyKey: "old" }), /工具不存在/);
  await assert.rejects(
    f.call("works_save", { draftId: "old", revision: 1, idempotencyKey: "old" }),
    /validation|Invalid|Unrecognized/,
  );
});

test("one direct save updates fields, returns no draft identifiers, cleans snapshots and deduplicates", async () => {
  const f = fixture(false);
  const args = {
    itemId: "123",
    patch: { item_name: "直接修改", update_summary: "新纪要" },
    base: { item_name: "原名称" },
    idempotencyKey: "direct",
  };
  const result = (await f.call("works_save", args)) as McpOperation;
  assert.equal(result.state, "succeeded");
  assert.equal(result.itemId, "123");
  assert.equal("draftId" in result, false);
  assert.equal("revision" in result, false);
  assert.equal(f.remote.fields.item_name, "直接修改");
  assert.equal(f.remote.fields.update_summary, "新纪要");
  assert.equal(f.service.data.drafts.length, 0);
  assert.equal(((await f.call("works_save", args)) as McpOperation).id, result.id);
  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.review, 0);
  await assert.rejects(f.call("works_save", { ...args, patch: { item_name: "别的" } }), /幂等键/);
  await assert.rejects(f.call("works_save", { ...args, idempotencyKey: "stale" }), /内容已变化/);
  assert.equal(f.service.data.drafts.length, 0);
});

test("direct create, review and save-review keep distinct grants and fail-closed state checks", async () => {
  const f = fixture(false);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: ["works:save"] });
  const args = { itemId: "123", patch: { item_name: "新名称" }, idempotencyKey: "direct", submitReview: true };
  await assert.rejects(f.call("works_save", args), /权限/);
  assert.equal(f.counts.save, 0);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  const saved = (await f.call("works_save", args)) as McpOperation;
  assert.equal(saved.state, "succeeded");
  assert.equal(f.counts.review, 1);
  const created = (await f.call("works_create", {
    fields: { item_name: "新作品" },
    idempotencyKey: "create",
  })) as McpOperation;
  assert.equal(created.state, "created_id_unresolved");
  assert.equal(f.counts.create, 1);
});

test("direct unknown writes remain blocked across new requests without retaining completed drafts", async () => {
  const f = fixture(false);
  f.ports.saveWork = async (_draft, _patch, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "超时");
  };
  const args = { itemId: "123", patch: { item_name: "未知" }, idempotencyKey: "unknown" };
  const result = (await f.call("works_save", args)) as McpOperation;
  assert.equal(result.state, "unknown");
  assert.equal(f.service.data.drafts.length, 1);
  await assert.rejects(f.call("works_save", { ...args, idempotencyKey: "new" }), /待核实/);
  assert.equal(((await f.call("works_save", args)) as McpOperation).id, result.id);
});

test("local material paths reject network paths, streams, links, directories and unrelated file types", async () => {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-local-path-"));
  try {
    const file = join(root, "宣传图.PNG");
    await writeFile(file, "image");
    assert.equal(await resolveLocalMaterial(file, "image"), await realpath(file));
    for (const path of [
      "image.png",
      "https://example.com/image.png",
      "\\\\server\\share\\image.png",
      "//server/share/image.png",
      `${file}:secret`,
      `${root}/../image.png`,
      `${file}\0`,
      join(root, "secret.txt"),
    ])
      await assert.rejects(resolveLocalMaterial(path, "image"), /绝对路径|格式/);
    await assert.rejects(resolveLocalMaterial(join(root, "missing.png"), "image"), /无法读取指定素材文件/);
    await mkdir(join(root, "folder.png"));
    await assert.rejects(resolveLocalMaterial(join(root, "folder.png"), "image"), /普通文件/);
    await mkdir(join(root, "real"));
    await writeFile(join(root, "real", "image.png"), "image");
    await symlink(join(root, "real"), join(root, "linked"), "junction");
    await assert.rejects(resolveLocalMaterial(join(root, "linked", "image.png"), "image"), /链接|联接点/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("direct uploads require one explicit source before permissions and never default to a picker", async () => {
  const f = fixture(false);
  let picked = 0;
  f.ports.pickFile = async () => {
    picked++;
    return null;
  };
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: ["netease:works.read"] });
  for (const name of ["works_upload", "promotion_upload"])
    for (const source of [
      {},
      { directoryId: "d" },
      { relativePath: "image.png" },
      { filePath: "image.png", interactive: true },
      { filePath: "image.png", directoryId: "d", relativePath: "image.png" },
    ])
      await assert.rejects(
        f.call(name, { kind: "image", idempotencyKey: "invalid", ...source }),
        /素材来源|必须同时提供/,
      );
  assert.equal(f.service.snapshot().requests.length, 0);
  assert.equal(picked, 0);
  await assert.rejects(
    f.call("works_upload", { kind: "image", filePath: join(tmpdir(), "image.png"), idempotencyKey: "denied" }),
    /权限/,
  );
  assert.equal(picked, 0);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  const cancelled = (await f.call("works_upload", {
    kind: "image",
    interactive: true,
    idempotencyKey: "picker",
  })) as McpOperation;
  assert.equal(cancelled.state, "rejected");
  assert.equal(picked, 1);
});

test("background uploads preserve snapshots, deduplicate and stop before upload after revocation", async () => {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-background-"));
  const f = fixture(false);
  try {
    const filePath = join(root, "image.png");
    await writeFile(filePath, "original");
    f.ports.assetRoot = join(root, "snapshots");
    f.ports.pickFile = async () => {
      throw new Error("Unexpected picker");
    };
    const upload = f.ports.upload;
    f.ports.upload = async (draft, asset, guard) => {
      await writeFile(filePath, "changed");
      assert.equal(await readFile(asset.path, "utf8"), "original");
      return upload(draft, asset, guard);
    };
    const args = { itemId: "123", kind: "image", filePath, idempotencyKey: "background" };
    const result = (await f.call("works_upload", args)) as McpOperation;
    assert.equal(result.state, "succeeded");
    assert.equal(((await f.call("works_upload", args)) as McpOperation).id, result.id);
    assert.equal(f.counts.upload, 1);
    assert.equal(JSON.stringify(f.service.snapshot()).includes(filePath.replace(/\\/g, "\\\\")), false);
    await assert.rejects(f.call("works_upload", { ...args, filePath: join(root, "other.png") }), /幂等键/);
    f.ports.upload = async (draft, asset, guard) => {
      f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: ["netease:works.read"] });
      return upload(draft, asset, guard);
    };
    await assert.rejects(f.call("works_upload", { ...args, idempotencyKey: "revoked" }), /权限|授权/);
    assert.equal(f.counts.upload, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("direct uploads are reusable by their work and cannot cross work or client boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-direct-assets-"));
  const f = fixture(false);
  try {
    const source = join(root, "image.png");
    await writeFile(source, "material");
    f.ports.assetRoot = join(root, "snapshots");
    f.ports.pickFile = async () => {
      throw new Error("Background uploads must not open a picker");
    };
    const uploaded = (await f.call("works_upload", {
      itemId: "123",
      kind: "image",
      filePath: source,
      channelId: 1,
      idempotencyKey: "upload",
    })) as McpOperation;
    assert.equal(uploaded.state, "succeeded");
    assert.ok(uploaded.assetId);
    assert.equal(JSON.stringify(uploaded).includes(root), false);
    assert.equal("filePath" in uploaded, false);
    const patch = { channel: [{ channel_id: 1, channel_url: { $asset: uploaded.assetId, as: "receipt" } }] };
    await assert.rejects(f.call("works_save", { itemId: "456", patch, idempotencyKey: "other-work" }), /材料/);
    const saved = (await f.call("works_save", { itemId: "123", patch, idempotencyKey: "save" })) as McpOperation;
    assert.equal(saved.state, "succeeded");
    assert.equal(JSON.stringify(uploaded).includes("host-only"), false);
    const details = (await f.call("works_save", {
      itemId: "123",
      patch: { info: `<p><img src="glaze-asset:${uploaded.assetId}"></p>` },
      idempotencyKey: "save-detail-image",
    })) as McpOperation;
    assert.equal(details.state, "succeeded");
    assert.equal(f.remote.fields.info, '<p><img src="https://x.nosdn.127.net/a.png"></p>');
    const other = f.service.registerClient("Other");
    f.service.connected(other.id, () => {});
    f.service.grant(other.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
    await assert.rejects(
      f.service.call(other.id, "works_save", { itemId: "123", patch, idempotencyKey: "foreign" }),
      /材料/,
    );
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "glaze-mcp-direct-assets-")));
    await rm(root, { recursive: true, force: true });
  }
});

test("business writes pin the account, deduplicate, honor grants and block unknown retries", async () => {
  const f = fixture(false);
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  f.ports.invoke = async (method, params, guard, beforeWrite) => {
    guard();
    beforeWrite();
    calls.push({ method, params });
    return { outcome: "completed" };
  };
  const args = { id: "comment-1", content: "谢谢反馈", idempotencyKey: "reply" };
  f.accounts[0].current = false;
  f.accounts[1].current = true;
  const result = (await f.call("comments_reply", args)) as McpOperation;
  assert.equal(result.state, "succeeded");
  assert.equal(calls[0]?.params.account, "a");
  assert.equal("idempotencyKey" in (calls[0]?.params ?? {}), false);
  await f.call("comments_reply", args);
  assert.equal(calls.length, 1);
  await assert.rejects(f.call("comments_reply", { ...args, account: "b" }), /账号未授权/);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: ["netease:community.read"] });
  await assert.rejects(f.call("comments_reply", { ...args, idempotencyKey: "no-grant" }), /权限/);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
  f.ports.invoke = async (_m, _p, _g, beforeWrite) => {
    beforeWrite();
    throw new McpError("timeout", "超时");
  };
  const uncertain = (await f.call("messages_delete", { ids: ["mail-1"], idempotencyKey: "mail" })) as McpOperation;
  assert.equal(uncertain.state, "unknown");
  await assert.rejects(f.call("messages_delete", { ids: ["mail-1"], idempotencyKey: "retry" }), /待核实/);
});

test("business schemas reject invalid status operations, IDs and injection fields before host access", async () => {
  const f = fixture(false);
  let requests = 0;
  f.ports.invoke = async () => {
    requests++;
    return null;
  };
  for (const [name, args] of [
    ["works_delete", { itemId: "123", expectedStatus: "online", idempotencyKey: "delete" }],
    [
      "works_changePrice",
      {
        itemId: "123",
        expectedStatus: "online",
        price: 301,
        expectedPrice: 300,
        expectedPriceType: "diamond",
        idempotencyKey: "price",
      },
    ],
    ["messages_delete", { ids: ["../mail"], idempotencyKey: "mail" }],
    ["comments_reply", { id: "ok", content: "x".repeat(101), idempotencyKey: "comment" }],
    [
      "promotion_join",
      {
        kind: "review",
        activityId: "a",
        moduleId: "b",
        itemIds: ["123"],
        images: [{ sign: "fake" }],
        idempotencyKey: "promo",
      },
    ],
  ] as const)
    await assert.rejects(f.call(name, args), /validation|Invalid|Unrecognized|参数无效|Too big/);
  assert.equal(requests, 0);
});

test("promotion resolves only host-uploaded materials and never exposes signed receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-promo-"));
  const f = fixture(false);
  try {
    const source = join(root, "banner.png");
    await writeFile(source, "banner");
    f.ports.assetRoot = join(root, "snapshots");
    f.ports.pickFile = async () => {
      throw new Error("Background uploads must not open a picker");
    };
    const upload = (await f.call("promotion_upload", {
      kind: "banner",
      filePath: source,
      idempotencyKey: "banner",
    })) as McpOperation;
    assert.equal(upload.state, "succeeded");
    let received: Record<string, unknown> = {};
    f.ports.invoke = async (_m, params, guard, beforeWrite) => {
      guard();
      beforeWrite();
      received = params;
      return undefined;
    };
    const result = (await f.call("promotion_saveBanner", {
      itemId: "123",
      startTime: 1,
      imageAssetId: upload.assetId,
      idempotencyKey: "apply",
    })) as McpOperation;
    assert.equal(result.state, "succeeded");
    assert.equal(received.imageUrl, "https://x.nosdn.127.net/a.png");
    assert.equal("imageAssetId" in received, false);
    const wrong = (await f.call("promotion_join", {
      kind: "discount",
      activityId: "a",
      moduleId: "b",
      itemIds: ["123"],
      imageAssetIds: [upload.assetId],
      idempotencyKey: "wrong-kind",
    })) as McpOperation;
    assert.equal(wrong.state, "failed");
    assert.equal(JSON.stringify(result).includes("host-only"), false);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "glaze-mcp-promo-")));
    await rm(root, { recursive: true, force: true });
  }
});

test("HTTP direct tools serialize their schemas and complete one-call saves without snapshots", async () => {
  const f = fixture(false);
  const http = new McpHttpServer(f.service);
  const endpoint = await http.start(0);
  const client = new Client({ name: "Direct HTTP", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));
  try {
    await client.connect(transport);
    const connected = f.service.snapshot().clients.find((entry) => entry.name === "Direct HTTP");
    assert.ok(connected);
    f.service.grant(connected.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpPermissions] });
    const tools = await client.listTools();
    assert.equal(
      tools.tools.some((tool) => tool.name.startsWith("works_draft_")),
      false,
    );
    const result = await client.callTool({
      name: "works_save",
      arguments: { itemId: "123", patch: { item_name: "HTTP直接保存" }, idempotencyKey: "http" },
    });
    assert.equal(result.isError, undefined);
    assert.ok(result.structuredContent);
    const operation = result.structuredContent.result as McpOperation;
    assert.equal(operation.state, "succeeded");
    assert.equal("draftId" in operation, false);
    assert.equal(f.remote.fields.item_name, "HTTP直接保存");
  } finally {
    await transport.terminateSession();
    await client.close();
    await http.stop();
  }
});

test("host business adapter checks the fixed account immediately before sending and never leaks credentials", async () => {
  const originalFetch = globalThis.fetch;
  let sent = 0;
  let allowed = true;
  let account = "";
  const invoke = createMcpBusiness({
    request: async (id, call) => {
      account = id ?? "";
      const response = await call({ sessionCookie: "TEST_ONLY_SESSION" });
      if (!response.ok) throw new McpError(response.error.kind, "test platform error");
      return response.value;
    },
  });
  globalThis.fetch = async (url, init) => {
    sent++;
    assert.ok(String(url).endsWith("/items/comment/pe/comment-1/reply"));
    assert.equal(init?.method, "PUT");
    assert.deepEqual(JSON.parse(String(init?.body)), { content: "谢谢" });
    return new Response(JSON.stringify({ status: 200, data: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    let checked = 0;
    const guard = () => {
      if (!allowed) throw new McpError("forbidden", "revoked");
      checked++;
    };
    const result = await invoke(
      "comments.reply",
      { account: "pinned-account", id: "comment-1", content: "谢谢" },
      guard,
      guard,
    );
    assert.equal(result, undefined);
    assert.equal(account, "pinned-account");
    assert.ok(checked >= 3);
    assert.equal(sent, 1);
    allowed = false;
    await assert.rejects(
      invoke("comments.reply", { account: "pinned-account", id: "comment-1", content: "谢谢" }, guard, guard),
      /revoked/,
    );
    assert.equal(sent, 1);
    await assert.rejects(invoke("account.loginWithCookie", {}, guard, guard), /未注册/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("one-click keys keep the grant across reconnects and unknown keys are refused", async () => {
  const f = fixture(false);
  const http = new McpHttpServer(f.service);
  const endpoint = await http.start(0);
  const { client, key } = f.service.createKeyedClient("Claude Code", "claude-code", "assist");
  assert.deepEqual(client.permissions, mcpLevels.assist.permissions);
  assert.deepEqual(client.accounts, ["a", "b"]);
  assert.equal(client.defaultAccount, "a");
  assert.equal("key" in (f.service.snapshot().clients.find((entry) => entry.id === client.id) ?? {}), false);
  const count = f.service.data.clients.length;
  try {
    for (let round = 0; round < 2; round++) {
      const ai = new Client({ name: "伪造名称", version: "1" });
      await ai.connect(new StreamableHTTPClientTransport(new URL(`${endpoint}?key=${key}`)));
      const names = (await ai.listTools()).tools.map((tool) => tool.name);
      assert.ok(names.includes("glaze_status") && names.includes("works_save") && names.includes("works_delete"));
      const status = (await ai.callTool({ name: "glaze_status", arguments: {} })).structuredContent?.result as {
        approved: boolean;
        level: string;
      };
      assert.equal(status.approved, true);
      assert.equal(status.level, "帮我打理");
      assert.equal(
        (await ai.listPrompts()).prompts.some((prompt) => prompt.name === "daily_report"),
        true,
      );
      await ai.close();
    }
    assert.equal(f.service.data.clients.length, count);
    assert.equal(f.service.snapshot().clients.find((entry) => entry.id === client.id)?.approved, true);
    const refused = await fetch(`${endpoint}?key=wrong-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } },
      }),
    });
    assert.equal(refused.status, 401);
    assert.equal(f.service.data.clients.length, count);
    f.service.revoke(client.id);
    assert.equal(f.service.clientByKey(key), undefined);
  } finally {
    await http.stop();
  }
});

test("missing permissions open one request that the user can allow always, once or deny", async () => {
  const f = fixture(false);
  f.service.accessWaitMs = 1000;
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpLevels.view.permissions] });
  const calls: string[] = [];
  f.ports.invoke = async (method, _params, _guard, beforeWrite) => {
    beforeWrite();
    calls.push(method);
    return null;
  };
  const args = { id: "comment-1", content: "谢谢反馈" };
  /** Answer the first open request once it appears */
  const answer = async (decision: "always" | "once" | "deny") => {
    for (let attempt = 0; attempt < 50 && !f.service.snapshot().requests.length; attempt++) await delay(5);
    const request = f.service.snapshot().requests[0];
    assert.ok(request);
    assert.equal(request.kind, "permission");
    assert.deepEqual(request.permissions, ["netease:community.write"]);
    f.service.answer(request.id, decision);
  };
  const denied = f.call("comments_reply", { ...args, idempotencyKey: "deny" });
  await answer("deny");
  await assert.rejects(denied, /拒绝/);
  const once = f.call("comments_reply", { ...args, idempotencyKey: "once" });
  await answer("once");
  await once;
  assert.equal(f.service.data.clients[0]?.permissions.includes("netease:community.write"), false);
  const always = f.call("comments_reply", { ...args, idempotencyKey: "always" });
  await answer("always");
  await always;
  assert.equal(f.service.data.clients[0]?.permissions.includes("netease:community.write"), true);
  await f.call("comments_reply", { ...args, idempotencyKey: "later" });
  assert.equal(f.service.snapshot().requests.length, 0);
  assert.equal(calls.length, 3);
  f.service.accessWaitMs = 0;
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpLevels.view.permissions] });
  await assert.rejects(f.call("comments_reply", { ...args, idempotencyKey: "late" }), /权限/);
  const late = f.service.snapshot().requests[0];
  assert.ok(late);
  f.service.answer(late.id, "once");
  await f.call("comments_reply", { ...args, idempotencyKey: "late" });
  await assert.rejects(f.call("comments_reply", { ...args, idempotencyKey: "late-2" }), /权限/);
});

test("manual connections ask to connect and get the recommended level once allowed", async () => {
  const f = fixture(false);
  const manual = f.service.registerClient("Cherry Studio");
  f.service.connected(manual.id, () => {});
  await assert.rejects(f.service.call(manual.id, "works_list", {}), /批准/);
  const request = f.service.snapshot().requests.find((entry) => entry.clientId === manual.id);
  assert.equal(request?.kind, "connect");
  assert.equal(f.service.describe(manual.id).approved, false);
  f.service.answer(request?.id ?? "", "always");
  const approved = f.service.snapshot().clients.find((entry) => entry.id === manual.id);
  assert.equal(approved?.approved, true);
  assert.deepEqual(approved?.permissions, mcpLevels.assist.permissions);
  assert.equal(approved?.persistent, false);
  assert.throws(() => f.service.answer(request?.id ?? "", "always"), /已处理/);
});

test("Codex config edits replace only the glaze server table", () => {
  const text = [
    'model = "gpt"',
    "",
    "[mcp_servers.other]",
    'url = "http://x"',
    "",
    "[mcp_servers.glaze]",
    'url = "http://127.0.0.1:1/mcp?key=old"',
    "",
    "[mcp_servers.glaze.env]",
    'A = "1"',
    "",
    "[profiles.default]",
    'model = "o"',
  ].join("\n");
  const cleaned = withoutTomlServer(text);
  assert.equal(cleaned.includes("glaze"), false);
  assert.ok(cleaned.includes("[mcp_servers.other]") && cleaned.includes("[profiles.default]"));
  assert.equal(withoutTomlServer(text, (block) => !block.includes("old")).includes("glaze"), false);
  assert.ok(withoutTomlServer(text, (block) => !block.includes("other-key")).includes("[mcp_servers.glaze]"));
});

test("an advance one-time approval from glaze_request_access is used by the next matching call", async () => {
  const f = fixture(false);
  f.service.accessWaitMs = 1000;
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpLevels.view.permissions] });
  f.ports.invoke = async (_method, _params, _guard, beforeWrite) => {
    beforeWrite();
    return null;
  };
  const asked = f.service.call(f.client.id, "glaze_request_access", {
    permissions: ["netease:community.write"],
    reason: "回复一条评论",
  });
  for (let attempt = 0; attempt < 50 && !f.service.snapshot().requests.length; attempt++) await delay(5);
  f.service.answer(f.service.snapshot().requests[0]?.id ?? "", "once");
  assert.equal(((await asked) as { outcome: string }).outcome, "once");
  f.service.accessWaitMs = 0;
  await f.call("comments_reply", { id: "comment-1", content: "谢谢", idempotencyKey: "first" });
  assert.equal(f.service.snapshot().requests.length, 0);
  await assert.rejects(
    f.call("comments_reply", { id: "comment-1", content: "谢谢", idempotencyKey: "second" }),
    /权限/,
  );
});

test("save-review requests both missing permissions together and consumes them for one complete call", async () => {
  const f = fixture(false);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [...mcpLevels.view.permissions] });
  f.service.accessWaitMs = 1000;
  const args = { itemId: "123", patch: { item_name: "保存并提审" }, submitReview: true, idempotencyKey: "compound" };
  const saving = f.call("works_save", args);
  const request = f.service.snapshot().requests[0];
  assert.deepEqual(request?.permissions, ["works:save", "works:review"]);
  assert.deepEqual(f.counts, { save: 0, create: 0, review: 0, upload: 0 });
  assert.equal(f.service.data.operations.length, 0);
  f.service.answer(request?.id ?? "", "once");
  const result = (await saving) as McpOperation;
  assert.equal(result.state, "succeeded");
  assert.equal(f.counts.save, 1);
  assert.equal(f.counts.review, 1);
  assert.equal(f.service.allowed(f.client.id, "works:save"), false);
  assert.equal(f.service.allowed(f.client.id, "works:review"), false);
  assert.deepEqual(await f.call("works_save", args), result);
  assert.equal(f.service.requestCount(), 0);
  assert.equal(f.counts.review, 1);
  f.service.accessWaitMs = 0;
  await assert.rejects(
    f.call("works_save", { ...args, idempotencyKey: "compound-next" }),
    (error: McpError) => error.kind === "permission_pending",
  );
  assert.deepEqual(f.service.snapshot().requests[0]?.permissions, ["works:save", "works:review"]);
});

test("save-review requests its extra permission and a denial never starts or records a write", async () => {
  const f = fixture(false);
  f.service.grant(f.client.id, {
    accounts: ["a"],
    defaultAccount: "a",
    permissions: [...mcpLevels.assist.permissions],
  });
  f.service.accessWaitMs = 1000;
  const saving = f.call("works_save", {
    itemId: "123",
    patch: { item_name: "拒绝提审" },
    submitReview: true,
    idempotencyKey: "denied-compound",
  });
  const request = f.service.snapshot().requests[0];
  assert.deepEqual(request?.permissions, ["works:review"]);
  f.service.answer(request?.id ?? "", "deny");
  await assert.rejects(saving, (error: McpError) => error.kind === "forbidden");
  assert.equal(f.service.data.operations.length, 0);
  assert.equal(f.durable().operations.length, 0);
  assert.equal(f.counts.save, 0);
  assert.equal(f.counts.review, 0);
  assert.equal(f.service.allowed(f.client.id, "works:review"), false);
});

test("advance one-time review grants survive validation and replay but end after success or failure", async () => {
  const f = fixture(false);
  f.service.grant(f.client.id, {
    accounts: ["a"],
    defaultAccount: "a",
    permissions: [...mcpLevels.assist.permissions],
  });
  const args = {
    itemId: "123",
    patch: { item_name: "首次保存" },
    submitReview: true,
    idempotencyKey: "advance-compound",
  };
  /** Approve review in advance without adding it to the client's persistent grant */
  const approveReview = async () => {
    f.service.accessWaitMs = 1000;
    const asking = f.call("glaze_request_access", { permissions: ["works:review"], reason: "保存并提交审核" });
    const request = f.service.snapshot().requests[0];
    assert.deepEqual(request?.permissions, ["works:review"]);
    f.service.answer(request?.id ?? "", "once");
    await asking;
    f.service.accessWaitMs = 0;
  };
  await approveReview();
  await assert.rejects(f.call("works_save", { ...args, unknown: true }), /Unrecognized/);
  assert.equal(f.service.allowed(f.client.id, "works:review"), true);
  const result = (await f.call("works_save", args)) as McpOperation;
  assert.equal(result.state, "succeeded");
  assert.equal(f.service.allowed(f.client.id, "works:review"), false);
  await approveReview();
  assert.deepEqual(await f.call("works_save", args), result);
  assert.equal(f.service.allowed(f.client.id, "works:review"), true);
  await assert.rejects(f.call("works_save", { ...args, patch: { item_name: "变更幂等内容" } }), /幂等键/);
  assert.equal(f.service.allowed(f.client.id, "works:review"), true);
  f.ports.review = async (_account, _item, _expected, beforeWrite) => {
    beforeWrite();
    throw new McpError("network", "测试网络中断");
  };
  const failedArgs = { ...args, patch: { item_name: "保存后断网" }, idempotencyKey: "advance-failed" };
  const unknown = (await f.call("works_save", failedArgs)) as McpOperation;
  assert.equal(unknown.state, "unknown");
  assert.equal(f.service.allowed(f.client.id, "works:review"), false);
  assert.deepEqual(await f.call("works_save", failedArgs), unknown);
  assert.equal(f.counts.save, 2);
  assert.equal(f.counts.review, 1);
  await assert.rejects(
    f.call("works_save", { ...args, idempotencyKey: "needs-permission-again" }),
    (error: McpError) => error.kind === "permission_pending",
  );
});

test("scope changes revoke unused advance one-time permissions", async () => {
  const f = fixture(false);
  f.service.grant(f.client.id, {
    accounts: ["a"],
    defaultAccount: "a",
    permissions: [...mcpLevels.assist.permissions],
  });
  f.service.accessWaitMs = 0;
  await f.call("glaze_request_access", { permissions: ["works:review"], reason: "测试授权撤销" });
  f.service.answer(f.service.snapshot().requests[0]?.id ?? "", "once");
  assert.equal(f.service.allowed(f.client.id, "works:review"), true);
  f.service.disconnect(f.client.id);
  assert.equal(f.service.allowed(f.client.id, "works:review"), false);
});

test("concurrent permission requests cannot duplicate a one-time grant across calls", async () => {
  const f = fixture(false);
  f.service.grant(f.client.id, {
    accounts: ["a"],
    defaultAccount: "a",
    permissions: [...mcpLevels.assist.permissions],
  });
  f.service.accessWaitMs = 1000;
  const args = {
    itemId: "123",
    patch: { item_name: "并发提审" },
    submitReview: true,
    idempotencyKey: "concurrent-once",
  };
  const saving = f.call("works_save", args);
  const asking = f.call("glaze_request_access", { permissions: ["works:review"], reason: "同一提审请求" });
  await assert.rejects(
    f.call("works_save", { ...args, idempotencyKey: "concurrent-rejected" }),
    (error: McpError) => error.kind === "rate_limited",
  );
  assert.equal(f.service.requestCount(), 1);
  f.service.answer(f.service.snapshot().requests[0]?.id ?? "", "once");
  await Promise.all([saving, asking]);
  assert.equal(f.service.allowed(f.client.id, "works:review"), false);
  assert.equal(f.counts.review, 1);
  f.service.accessWaitMs = 0;
  await assert.rejects(
    f.call("works_save", { ...args, idempotencyKey: "concurrent-next" }),
    (error: McpError) => error.kind === "permission_pending",
  );
});

test("decrypted stores migrate legacy history and reject malformed durable archives", () => {
  const legacy = emptyMcpData();
  delete legacy.operationArchive;
  const migrated = parseMcpData(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(migrated.operationArchive, []);
  for (const invalid of [null, {}, "history", 12])
    assert.throws(() => parseMcpData({ ...emptyMcpData(), operationArchive: invalid }), /授权文件无法读取/);
});

test("completed history rolls into durable archives and old keys still return their exact result after restart", async () => {
  const f = fixture(false, 2);
  const requests = Array.from({ length: 5 }, (_, index) => ({
    itemId: "123",
    patch: { item_name: `历史保存 ${index}` },
    idempotencyKey: `history-${index}`,
  }));
  const first = (await f.call("works_save", requests[0])) as McpOperation;
  for (const args of requests.slice(1)) await f.call("works_save", args);
  assert.equal(f.counts.save, 5);
  assert.equal(f.service.data.operations.length, 2);
  assert.equal(f.service.data.operationArchive?.length, 3);
  assert.equal(f.service.snapshot().operations.length, 2);
  assert.deepEqual(await f.call("works_operation_get", { operationId: first.id }), first);
  const restarted = new McpService(structuredClone(f.durable()), f.ports, 2);
  restarted.status = "running";
  assert.deepEqual(await restarted.call(f.client.id, "works_save", requests[0]), first);
  assert.equal(f.counts.save, 5);
  await assert.rejects(
    restarted.call(f.client.id, "works_save", { ...requests[0], patch: { item_name: "不同的旧请求" } }),
    /幂等键/,
  );
  restarted.grant(f.client.id, { accounts: ["b"], defaultAccount: "b", permissions: [...mcpPermissions] });
  await assert.rejects(restarted.call(f.client.id, "works_save", { ...requests[0], account: "a" }), /账号未授权/);
  assert.equal(f.counts.save, 5);
});

test("idempotent replays still share the client's business call rate limit", async () => {
  const f = fixture(false);
  const args = { itemId: "123", patch: { item_name: "重复查询原结果" }, idempotencyKey: "rate-limited-replay" };
  const result = await f.call("works_save", args);
  for (let index = 0; index < 59; index++) assert.deepEqual(await f.call("works_save", args), result);
  const auditCount = f.service.data.audit.length;
  await assert.rejects(f.call("works_save", args), (error: McpError) => error.kind === "rate_limited");
  assert.equal(f.service.data.audit.length, auditCount);
  assert.equal(f.counts.save, 1);
  assert.equal(f.service.requestCount(), 0);
});

test("business history remains writable beyond 5000 results and archives preserve business deduplication", async () => {
  const f = fixture(false, 2);
  let writes = 0;
  f.ports.invoke = async (_method, _params, _guard, beforeWrite) => {
    beforeWrite();
    writes++;
    return { accepted: true };
  };
  const args = { id: "comment-1", content: "历史回复", idempotencyKey: "old-business" };
  const first = (await f.call("comments_reply", args)) as McpOperation;
  const seed = f.service.data.operations[0];
  assert.ok(seed);
  f.service.data.operations.push(
    ...Array.from({ length: 5000 }, (_, index) => ({
      ...structuredClone(seed),
      id: `old-${index}`,
      key: `old-key-${index}`,
    })),
  );
  await f.call("comments_reply", { ...args, idempotencyKey: "new-business" });
  assert.equal(writes, 2);
  assert.equal(f.service.data.operations.length, 2);
  assert.equal(f.service.data.operationArchive?.length, 5000);
  await f.call("comments_reply", { ...args, idempotencyKey: "newest-business" });
  assert.deepEqual(await f.call("comments_reply", args), first);
  assert.equal(writes, 3);
  const restarted = new McpService(structuredClone(f.durable()), f.ports, 2);
  restarted.status = "running";
  assert.deepEqual(await restarted.call(f.client.id, "comments_reply", args), first);
  assert.equal(writes, 3);
});

test("history retention never hides unresolved writes and reconciliation never makes an old key executable", async () => {
  const f = fixture(false, 1);
  f.ports.editor = async (_account, itemId) => ({ ...structuredClone(f.remote), itemId });
  const originalSave = f.ports.saveWork;
  f.ports.saveWork = async (draft, patch, beforeWrite) => {
    if (draft.itemId === "123") {
      beforeWrite();
      throw new McpError("network", "结果未知");
    }
    await originalSave(draft, patch, beforeWrite);
  };
  const args = { itemId: "123", patch: { item_name: "待核实" }, idempotencyKey: "retained-unknown" };
  const unknown = (await f.call("works_save", args)) as McpOperation;
  assert.equal(unknown.state, "unknown");
  for (let index = 0; index < 4; index++)
    await f.call("works_save", {
      itemId: "456",
      patch: { item_name: `其他作品 ${index}` },
      idempotencyKey: `retained-success-${index}`,
    });
  assert.equal(f.service.data.operations.length, 2);
  assert.equal(
    f.service.data.operations.some((operation) => operation.id === unknown.id),
    true,
  );
  assert.equal(
    f.service.data.operationArchive?.some((operation) => operation.id === unknown.id),
    false,
  );
  const restarted = new McpService(structuredClone(f.durable()), f.ports, 1);
  restarted.status = "running";
  await assert.rejects(restarted.call(f.client.id, "works_save", { ...args, idempotencyKey: "blocked-new" }), /待核实/);
  assert.deepEqual(await restarted.call(f.client.id, "works_save", args), unknown);
  restarted.resolveOperation(unknown.id);
  const reconciled = (await restarted.call(f.client.id, "works_save", args)) as McpOperation;
  assert.equal(reconciled.id, unknown.id);
  assert.equal(reconciled.state, "unknown");
  assert.ok(reconciled.resolvedAt);
  assert.equal(
    restarted.data.operationArchive?.some((operation) => operation.id === unknown.id),
    true,
  );
  f.ports.saveWork = originalSave;
  assert.equal(
    (
      (await restarted.call(f.client.id, "works_save", {
        ...args,
        idempotencyKey: "after-reconciliation",
      })) as McpOperation
    ).state,
    "succeeded",
  );
  assert.equal(f.counts.save, 5);
});

test("history rollover protects unresolved creations, platform actions and saves whose later review failed", async () => {
  const f = fixture(false, 0);
  f.ports.editor = async (_account, itemId) => ({ ...structuredClone(f.remote), itemId });
  const createArgs = { fields: { item_name: "新建待核实" }, idempotencyKey: "protected-create" };
  const created = (await f.call("works_create", createArgs)) as McpOperation;
  f.ports.review = async (_account, _itemId, _expected, beforeWrite) => {
    beforeWrite();
    return { needCheckApply: true, queueLength: 0 };
  };
  const platformArgs = {
    itemId: "123",
    patch: { item_name: "需平台处理" },
    submitReview: true,
    idempotencyKey: "protected-platform",
  };
  const platform = (await f.call("works_save", platformArgs)) as McpOperation;
  f.ports.review = async () => {
    throw new McpError("business", "提审被平台拒绝");
  };
  const failedArgs = {
    itemId: "456",
    patch: { item_name: "保存已成功" },
    submitReview: true,
    idempotencyKey: "protected-partial",
  };
  const failed = (await f.call("works_save", failedArgs)) as McpOperation;
  await f.call("works_save", { itemId: "789", patch: { item_name: "普通完成" }, idempotencyKey: "archived-success" });
  assert.equal(created.state, "created_id_unresolved");
  assert.equal(platform.state, "platform_action");
  assert.equal(failed.state, "failed");
  assert.equal((failed.result as { saved: boolean }).saved, true);
  assert.deepEqual(
    new Set(f.service.snapshot().operations.map((operation) => operation.id)),
    new Set([created.id, platform.id, failed.id]),
  );
  assert.equal(f.service.data.operationArchive?.length, 1);
  const restarted = new McpService(structuredClone(f.durable()), f.ports, 0);
  restarted.status = "running";
  for (const [name, args] of [
    ["works_create", createArgs],
    ["works_save", platformArgs],
    ["works_save", failedArgs],
  ] as const)
    await assert.rejects(
      restarted.call(f.client.id, name, { ...args, idempotencyKey: `${args.idempotencyKey}-new` }),
      /待核实/,
    );
  assert.equal(f.counts.create, 1);
  assert.equal(f.counts.save, 3);
});

const appInputs: Record<string, Record<string, unknown>> = {
  app_settings_get: {},
  app_appearance_set: { settings: { ...defaultAppearance, scale: 110 } },
  app_general_set: { settings: { ...defaultGeneral, startPage: "works" } },
  app_layout_ranking_set: { boards: ["pe_sell", "pe_hot"] },
  app_layout_reset: {},
  app_session_settings_set: { settings: { autoLogin: false, notifyOnExpire: false } },
  app_cache_clear: {},
  app_plugins_list: {},
  app_plugins_set_enabled: { id: "glaze.works", enabled: false },
  app_logs_list: {},
  app_open_page: { route: "glaze.home/home" },
  app_switch_account: { account: "a" },
};

for (const tool of appTools) {
  test(`${tool.name}: strict inputs precede permission requests and one-time approval reaches the host`, async () => {
    const f = fixture(false);
    f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [] });
    const input = { ...appInputs[tool.name], ...(tool.readOnly ? {} : { idempotencyKey: tool.name }) };
    await assert.rejects(f.call(tool.name, { ...input, unknown: true }), /Unrecognized/);
    assert.equal(f.service.snapshot().requests.length, 0);
    const invoked: string[] = [];
    f.ports.invoke = async (method, params, guard, beforeWrite) => {
      guard();
      if (!tool.readOnly) beforeWrite();
      assert.equal(params.account, tool.name === "app_switch_account" ? "a" : null);
      invoked.push(method);
      return { value: "完成", token: "secret" };
    };
    await assert.rejects(f.call(tool.name, input), (error: McpError) => error.kind === "permission_pending");
    assert.equal(invoked.length, 0);
    const request = f.service.snapshot().requests[0];
    assert.deepEqual(request?.permissions, [tool.permission]);
    f.service.answer(request?.id ?? "", "once");
    const result = await f.call(tool.name, input);
    assert.deepEqual(invoked, [tool.invoke]);
    assert.equal(JSON.stringify(result).includes("secret"), false);
    assert.equal(f.service.data.audit[0]?.tool, tool.name);
    assert.equal(f.service.data.audit[0]?.result, "succeeded");
    assert.equal(f.service.data.audit[0]?.account, tool.name === "app_switch_account" ? "a" : null);
  });
}

/** Compose real preference, registry and log services with isolated storage and native stubs */
async function applicationFixture(t: { after(callback: () => Promise<void>): void }) {
  const f = fixture(false);
  const root = await mkdtemp(join(tmpdir(), "glaze-mcp-application-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const values = new Map<string, unknown>();
  const layouts = new Map<string, unknown>();
  const store = {
    get: (key: string) => values.get(key),
    set: (key: string, value: unknown) => values.set(key, value),
    getLayout: (key: string) => layouts.get(key),
    setLayout: (key: string, value: unknown) => layouts.set(key, value),
    resetLayouts: () => layouts.clear(),
  } as unknown as PreferenceStore;
  const events: { name: string; payload?: unknown }[] = [];
  const manifests: BuiltinPlugin[] = [
    {
      id: "glaze.home",
      name: "首页",
      version: "1",
      description: "",
      contributes: { pages: [{ id: "home", title: "首页" }] },
    },
    {
      id: "glaze.account",
      name: "账号",
      version: "1",
      description: "",
      contributes: {
        pages: [
          { id: "account", title: "账号管理" },
          { id: "login", title: "登录", chrome: "none" },
          { id: "login-expired", title: "重新登录", chrome: "none" },
        ],
      },
    },
    {
      id: "glaze.works",
      name: "作品",
      version: "1",
      description: "",
      contributes: { pages: [{ id: "works", title: "作品管理" }] },
    },
  ];
  const logs = new LogService(join(root, "logs"));
  const plugins = new PluginRegistry(store, join(root, "plugins"), manifests, [], logs, () =>
    events.push({ name: "plugins.changed" }),
  );
  let loginItem = false;
  const general = new GeneralService(store, {
    readLoginItem: () => ({ supported: true, enabled: loginItem, warning: null }),
    setLoginItem: (enabled) => {
      loginItem = enabled;
    },
    ensureTray: () => {},
  });
  const cache = new CacheService(
    { getCacheSize: async () => 0, clearCache: async () => {}, clearCodeCaches: async () => {} },
    () => {},
    () => events.push({ name: "cache.cleared" }),
  );
  const actions = createApplicationActions(
    {
      appearance: new AppearanceService(store),
      general,
      cache,
      plugins,
      sessionSettings: new SessionSettingsService(store),
      sessions: {
        /** Simulate asynchronous session validation before the actual account selection */
        switchTo: async (id, beforeSwitch) => {
          await Promise.resolve();
          beforeSwitch?.();
          const selected = f.accounts.find((account) => account.id === id);
          assert.ok(selected);
          for (const account of f.accounts) account.current = account.id === id;
          events.push({ name: "account.changed" });
          return selected;
        },
      },
    },
    (name, payload) => events.push({ name, payload }),
  );
  let windowAvailable = true;
  const win: NavigationWindow = {
    isMinimized: () => true,
    restore: () => events.push({ name: "restore" }),
    show: () => events.push({ name: "show" }),
    focus: () => events.push({ name: "focus" }),
    navigate: (payload) => events.push({ name: "app.navigate", payload }),
  };
  const application = createMcpApplication(actions, plugins, logs, manifests, () => {
    if (!windowAvailable) throw new McpError("unavailable", "请先打开应用窗口");
    return win;
  });
  f.ports.invoke = createMcpBusiness(
    {
      request: async () => {
        throw new Error("Unexpected network request");
      },
    },
    application,
  );
  return {
    ...f,
    actions,
    values,
    events,
    plugins,
    logs,
    application,
    closeWindow: () => {
      windowAvailable = false;
    },
  };
}

test("application permission levels exclude logs from view and preserve shell-only RPC metadata", () => {
  for (const level of ["view", "assist", "full"] as const)
    assert.equal(mcpLevelOf(mcpLevels[level].permissions), level);
  assert.ok(mcpLevels.view.permissions.includes("app:settings.read"));
  assert.ok(mcpLevels.view.permissions.includes("app:plugins.read"));
  assert.equal(mcpLevels.view.permissions.includes("app:logs.read"), false);
  assert.ok(mcpLevels.assist.permissions.includes("app:logs.read"));
  assert.ok(mcpLevels.assist.permissions.includes("app:navigate"));
  assert.equal(mcpLevels.assist.permissions.includes("app:settings.write"), false);
  for (const method of [
    "appearance.set",
    "general.set",
    "layout.setRanking",
    "layout.reset",
    "sessionSettings.set",
    "plugins.setEnabled",
    "logs.list",
    "account.switch",
  ] as const)
    assert.equal(capabilities[method].caller, "shell");
});

test("application settings read real services and every mutation broadcasts once despite retries", async (t) => {
  const f = await applicationFixture(t);
  assert.deepEqual(await f.call("app_settings_get"), {
    appearance: defaultAppearance,
    general: { settings: defaultGeneral, launchAtLoginSupported: true, launchAtLoginWarning: null },
    ranking: defaultRankingBoards,
    session: defaultSessionSettings,
  });
  const writes = [
    ["app_appearance_set", "appearance.changed"],
    ["app_general_set", "general.changed"],
    ["app_layout_ranking_set", "layout.rankingChanged"],
    ["app_layout_reset", "layout.rankingChanged"],
    ["app_session_settings_set", "sessionSettings.changed"],
    ["app_cache_clear", "cache.cleared"],
    ["app_plugins_set_enabled", "plugins.changed"],
  ];
  for (const [name, event] of writes) {
    assert.ok(name && event);
    const before = f.events.filter((entry) => entry.name === event).length;
    const input = { ...appInputs[name], idempotencyKey: name };
    const result = (await f.call(name, input)) as McpOperation;
    assert.equal(result.state, "succeeded");
    assert.equal(((await f.call(name, input)) as McpOperation).id, result.id);
    assert.equal(f.events.filter((entry) => entry.name === event).length, before + 1);
  }
  assert.deepEqual(f.values.get("appearance"), appInputs.app_appearance_set?.settings);
  assert.deepEqual(f.values.get("sessionSettings"), appInputs.app_session_settings_set?.settings);
  assert.deepEqual(
    f.events.find((event) => event.name === "appearance.changed")?.payload,
    appInputs.app_appearance_set?.settings,
  );
  assert.equal(f.plugins.snapshot().plugins.find((plugin) => plugin.id === "glaze.works")?.enabled, false);
  await assert.rejects(
    f.call("app_appearance_set", { settings: defaultAppearance, idempotencyKey: "app_appearance_set" }),
    /幂等键/,
  );
});

test("application schemas reject invalid values and never request permissions for malformed settings", async () => {
  const f = fixture(false);
  f.service.grant(f.client.id, { accounts: ["a"], defaultAccount: "a", permissions: [] });
  const badInputs: [string, unknown][] = [
    ["app_appearance_set", { settings: { ...defaultAppearance, scale: 99 } }],
    ["app_appearance_set", { settings: { ...defaultAppearance, token: "secret" } }],
    ["app_general_set", { settings: { ...defaultGeneral, launchAtLogin: "true" } }],
    ["app_layout_ranking_set", { boards: ["pe_hot", "pe_hot"] }],
    ["app_layout_ranking_set", { boards: [] }],
    ["app_session_settings_set", { settings: { autoLogin: true } }],
    ["app_plugins_set_enabled", { id: "glaze.works", enabled: "false" }],
    ["app_logs_list", { limit: 201 }],
    ["app_logs_list", { level: "debug" }],
    ["app_open_page", { route: "glaze.works/works", params: { itemId: "123" } }],
    ["app_switch_account", { account: "" }],
  ];
  for (const [name, input] of badInputs)
    await assert.rejects(
      f.call(name, { ...(input as object), ...(name === "app_logs_list" ? {} : { idempotencyKey: "bad" }) }),
      (error: McpError) => error.kind === "validation",
    );
  for (const tool of appTools.filter((tool) => !tool.readOnly))
    await assert.rejects(f.call(tool.name, appInputs[tool.name]), (error: McpError) => error.kind === "validation");
  assert.equal(f.service.snapshot().requests.length, 0);
});

test("navigation only opens enabled bundled pages and reports unavailable windows", async (t) => {
  const f = await applicationFixture(t);
  const listed = (await f.call("app_plugins_list")) as { id: string; pages: { route: string; title: string }[] }[];
  assert.deepEqual(listed.find((plugin) => plugin.id === "glaze.account")?.pages, [
    { route: "glaze.account/account", title: "账号管理" },
  ]);
  for (const route of [
    "glaze.account/login",
    "glaze.account/login-expired",
    "glaze.unknown/page",
    "https://example.invalid",
  ]) {
    const result = (await f.call("app_open_page", { route, idempotencyKey: route })) as McpOperation;
    assert.equal(result.state, "failed");
    assert.match(result.message, /页面不存在/);
  }
  f.plugins.setEnabled("glaze.works", false);
  assert.equal(
    ((await f.call("app_open_page", { route: "glaze.works/works", idempotencyKey: "disabled" })) as McpOperation).state,
    "failed",
  );
  assert.equal(
    f.events.some((event) => event.name === "app.navigate"),
    false,
  );
  const input = { route: "glaze.home/home", idempotencyKey: "home" };
  const opened = (await f.call("app_open_page", input)) as McpOperation;
  assert.deepEqual(opened.result, { route: "glaze.home/home", title: "首页" });
  assert.deepEqual(f.events.slice(-4), [
    { name: "restore" },
    { name: "show" },
    { name: "focus" },
    { name: "app.navigate", payload: { route: "glaze.home/home", params: {} } },
  ]);
  await f.call("app_open_page", input);
  assert.equal(f.events.filter((event) => event.name === "app.navigate").length, 1);
  f.closeWindow();
  const missing = (await f.call("app_open_page", { ...input, idempotencyKey: "closed" })) as McpOperation;
  assert.equal(missing.state, "failed");
  assert.match(missing.message, /打开应用窗口/);
});

test("account switching rejects unauthorized and expired accounts without changing the client default", async (t) => {
  const f = await applicationFixture(t);
  await assert.rejects(f.call("app_switch_account", { account: "b", idempotencyKey: "foreign" }), /账号未授权/);
  f.service.grant(f.client.id, { accounts: ["a", "b"], defaultAccount: "a", permissions: [...mcpPermissions] });
  f.accounts[1].status = "expired";
  await assert.rejects(f.call("app_switch_account", { account: "b", idempotencyKey: "expired" }), /已过期/);
  assert.equal(f.events.length, 0);
  f.accounts[1].status = "active";
  const result = (await f.call("app_switch_account", { account: "b", idempotencyKey: "switch" })) as McpOperation;
  assert.equal(result.state, "succeeded");
  assert.equal(f.accounts[1].current, true);
  assert.equal(f.service.data.clients[0]?.defaultAccount, "a");
  assert.equal(f.events[0]?.name, "account.changed");
  f.accounts[0].status = "expired";
  assert.ok(await f.call("app_settings_get"));
  assert.ok(await f.call("app_plugins_list"));
});

test("session switching rechecks authorization after async verification and before changing selection", async () => {
  let selected = false;
  let verified = false;
  const context = {
    exclusive: async (run: () => Promise<unknown>) => run(),
    check: async () => {
      verified = true;
      return { id: "b" };
    },
    accounts: {
      setCurrent: () => {
        selected = true;
      },
    },
    emit: () => {},
  };
  await assert.rejects(
    SessionManager.prototype.switchTo.call(context as unknown as SessionManager, "b", () => {
      assert.equal(verified, true);
      throw new McpError("forbidden", "授权已撤销");
    }),
    /授权已撤销/,
  );
  assert.equal(selected, false);
});

test("application guards stop writes when permission or account scope changes while switching", async (t) => {
  const f = await applicationFixture(t);
  const invoke = f.ports.invoke;
  assert.ok(invoke);
  f.ports.invoke = (method, params, guard, beforeWrite) =>
    invoke(method, params, guard, () => {
      f.service.revoke(f.client.id);
      beforeWrite();
    });
  await assert.rejects(f.call("app_switch_account", { account: "a", idempotencyKey: "revoked" }), /批准|授权/);
  assert.equal(
    f.events.some((event) => event.name === "account.changed"),
    false,
  );
});

test("logs are filtered, capped, redacted and passed through publicValue", async (t) => {
  const f = await applicationFixture(t);
  f.logs.write("info", "test", "普通日志");
  for (let index = 0; index < 205; index++) f.logs.write("warn", "test", `警告 ${index} token=super-secret`);
  const result = (await f.call("app_logs_list", { level: "warn", limit: 200 })) as {
    entries: { level: string; message: string }[];
    truncated: boolean;
  };
  assert.equal(result.entries.length, 200);
  assert.equal(result.truncated, true);
  assert.ok(result.entries.every((entry) => entry.level === "warn" && !entry.message.includes("super-secret")));
  assert.equal(((await f.call("app_logs_list")) as { entries: unknown[] }).entries.length, 100);
  assert.equal(((await f.call("app_logs_list", { level: "error" })) as { entries: unknown[] }).entries.length, 0);
  f.ports.invoke = async () => ({
    entries: [{ message: "脱敏日志", cookie: "must-not-leak", nested: { authorization: "must-not-leak", safe: "ok" } }],
  });
  assert.equal(JSON.stringify(await f.call("app_logs_list")).includes("must-not-leak"), false);
});

test("required plugins and unsupported themes fail without broadcasts or uncertain writes", async (t) => {
  const f = await applicationFixture(t);
  const plugin = (await f.call("app_plugins_set_enabled", {
    id: "glaze.home",
    enabled: false,
    idempotencyKey: "required",
  })) as McpOperation;
  assert.equal(plugin.state, "failed");
  assert.match(plugin.message, /不能更改/);
  const appearance = (await f.call("app_appearance_set", {
    settings: { ...defaultAppearance, themeId: "missing" },
    idempotencyKey: "missing",
  })) as McpOperation;
  assert.equal(appearance.state, "failed");
  assert.match(appearance.message, /主题未启用/);
  assert.equal(f.events.length, 0);
});

test("the active optional theme cannot be disabled through MCP", async (t) => {
  const f = await applicationFixture(t);
  const preview = f.plugins.preview(themeFixture().bytes);
  f.plugins.install(preview.token);
  f.values.set("appearance", { ...defaultAppearance, themeId: "demo.ocean" });
  f.events.length = 0;
  const result = (await f.call("app_plugins_set_enabled", {
    id: "demo.ocean",
    enabled: false,
    idempotencyKey: "active-theme",
  })) as McpOperation;
  assert.equal(result.state, "failed");
  assert.match(result.message, /切换主题/);
  assert.equal(f.plugins.snapshot().plugins.find((plugin) => plugin.id === "demo.ocean")?.enabled, true);
  assert.equal(f.events.length, 0);
});

test("application tools retain plugin guards and account-independent write deduplication", async (t) => {
  const f = await applicationFixture(t);
  const checked: string[] = [];
  f.ports.assertEnabled = (method) => {
    checked.push(method);
  };
  const input = { settings: { ...defaultAppearance, scale: 110 }, idempotencyKey: "same-setting" };
  const first = (await f.call("app_appearance_set", input)) as McpOperation;
  assert.ok(checked.length >= 2 && checked.every((method) => method === "app.appearance_set"));
  f.service.grant(f.client.id, { accounts: ["b"], defaultAccount: "b", permissions: [...mcpPermissions] });
  assert.equal(((await f.call("app_appearance_set", input)) as McpOperation).id, first.id);
  assert.equal(f.events.filter((event) => event.name === "appearance.changed").length, 1);
  f.ports.assertEnabled = () => {
    throw new McpError("forbidden", "对应插件已停用");
  };
  await assert.rejects(f.call("app_settings_get"), /停用/);
});
