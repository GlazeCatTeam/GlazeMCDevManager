import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { type AccountSummary, isPromotionPage } from "../packages/contracts/src";
import { Client } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../packages/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { emptyMcpData, type McpPorts } from "../packages/mcp/src/model";
import { createMcpServer } from "../packages/mcp/src/server";
import { McpService } from "../packages/mcp/src/service";
import { getPromotionActivities, getPromotionApplications } from "../packages/netease/src/endpoints/promotion";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Exercise public calls against real promotion adapters with isolated credentials and no writes */
function queryFixture() {
  const account: AccountSummary = {
    id: "audit-account",
    nickname: "隔离测试",
    passport: null,
    avatarUrl: null,
    loginMethod: "cookie",
    lastLoginAt: 0,
    status: "active",
    current: true,
  };
  const unused = async (): Promise<never> => {
    throw new Error("Unexpected adapter call");
  };
  const ports: McpPorts = {
    save: () => {},
    changed: () => {},
    accounts: () => [account],
    assertEnabled: () => {},
    read: async (method, params) => {
      assert.equal(params.account, account.id);
      assert.ok(isPromotionPage(params));
      const session = { sessionCookie: "OFFLINE_TEST_ONLY" };
      const result =
        method === "promotion.activities"
          ? await getPromotionActivities(session, params)
          : await getPromotionApplications(session, params);
      assert.ok(result.ok);
      return result.value;
    },
    editor: unused,
    options: unused,
    validate: unused,
    saveWork: unused,
    createWork: unused,
    review: unused,
    pickFile: unused,
    upload: unused,
    assetRoot: join(tmpdir(), "glaze-mcp-query-unused"),
  };
  const service = new McpService(emptyMcpData(), ports);
  service.data.enabled = true;
  service.status = "running";
  service.accessWaitMs = 0;
  const client = service.registerClient("隔离测试 AI");
  service.connected(client.id, () => {});
  service.grant(client.id, {
    accounts: [account.id],
    defaultAccount: account.id,
    permissions: ["netease:promotion.read"],
  });
  return { service, client };
}

for (const name of ["promotion_activities", "promotion_applications"]) {
  test(`${name}: omitted and explicit pages reach the platform with correct offsets`, async () => {
    const f = queryFixture();
    const paths: URL[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      paths.push(url);
      return new Response(
        JSON.stringify({
          status: "ok",
          data: url.pathname.includes("user-applications") ? { applications: [], count: 0 } : { data: [], count: 0 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    };
    assert.deepEqual(await f.service.call(f.client.id, name, {}), { records: [], total: 0 });
    assert.equal(paths[0]?.searchParams.get("start"), "0");
    assert.equal(paths[0]?.searchParams.get("span"), "10");
    await f.service.call(f.client.id, name, { page: 2 });
    assert.equal(paths[1]?.searchParams.get("start"), "20");
    for (const page of [-1, 0.5, 10001, "0", null])
      await assert.rejects(f.service.call(f.client.id, name, { page }), { kind: "validation" });
    assert.equal(paths.length, 2);
    assert.equal(f.service.snapshot().requests.length, 0);
  });
}

test("SDK instructions execute explicitly requested, granted writes without repeated confirmation", async () => {
  const f = queryFixture();
  const server = createMcpServer(f.service, f.client.id);
  const client = new Client({ name: "instructions-test", version: "1" });
  const [host, peer] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(host);
    await client.connect(peer);
    assert.match(client.getInstructions() ?? "", /用户已明确要求且权限已允许的写操作直接执行，无需重复询问确认/);
    assert.match(client.getInstructions() ?? "", /必须符合用户已表达的意图/);
  } finally {
    await client.close();
    await server.close();
  }
});
