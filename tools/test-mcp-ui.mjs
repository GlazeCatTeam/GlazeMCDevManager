import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "../apps/desktop/node_modules/@vitejs/plugin-react/dist/index.js";
import { createServer } from "../apps/desktop/node_modules/vite/dist/node/index.js";

const { chromium } = await import(process.argv[2] ?? "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "node_modules/.cache/mcp-tests");
mkdirSync(output, { recursive: true });
const server = await createServer({
  configFile: false,
  root,
  logLevel: "warn",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 0, hmr: false },
  resolve: {
    alias: {
      "react-dom": join(root, "apps/desktop/node_modules/react-dom"),
      react: join(root, "apps/desktop/node_modules/react"),
    },
  },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { channel: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1120, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const listeners = new Map();
    const account = { id: "account-a", nickname: "MCP 测试账号", status: "active", current: true };
    const state = {
      port: 17839,
      endpoint: "http://127.0.0.1:17839/mcp",
      enabled: true,
      status: "running",
      error: null,
      clients: [
        {
          id: "client-a",
          name: "Codex",
          approved: true,
          connected: true,
          accounts: [account.id],
          defaultAccount: account.id,
          permissions: ["netease:account.read", "netease:works.read", "works:draft", "works:save", "works:review"],
          directories: [],
          lastSeen: new Date().toISOString(),
          expiresAt: Date.now() + 600000,
        },
      ],
      operations: [
        {
          id: "op-a",
          clientId: "client-a",
          clientName: "Codex",
          account: account.id,
          draftId: "draft-a",
          revision: 2,
          action: "save_review",
          state: "running",
          phase: "saving",
          message: "正在保存",
          createdAt: Date.now(),
          expiresAt: Date.now() + 900000,
        },
      ],
      drafts: [
        {
          id: "draft-a",
          clientId: "client-a",
          account: account.id,
          itemId: "123456789012345678",
          revision: 2,
          document: {
            itemId: "123456789012345678",
            status: "init",
            version: "1.0",
            modCode: "",
            guides: [],
            fields: { item_name: "冒险工具包", price: 300, update_summary: "旧说明" },
          },
          patch: { price: 600, update_summary: "修复联机同步问题，新增 3 个任务" },
          previewFields: { item_name: "冒险工具包", price: 600, update_summary: "修复联机同步问题，新增 3 个任务" },
          updatedAt: Date.now(),
          locked: false,
        },
      ],
      assets: [],
      audit: [
        {
          id: "log-a",
          time: new Date().toISOString(),
          clientId: "client-a",
          clientName: "Codex",
          tool: "works_draft_validate",
          account: account.id,
          result: "succeeded",
        },
      ],
    };
    globalThis.__completeMcpOperation = () => {
      state.operations[0].state = "succeeded";
      state.operations[0].message = "操作已完成";
      for (const handler of listeners.get("mcp.changed") ?? []) handler({ pendingCount: 0 });
    };
    globalThis.__mcpCalls = [];
    globalThis.__changeDraft = () => {
      state.drafts[0].revision++;
      state.drafts[0].previewFields.item_name = "AI 后续修改";
      for (const handler of listeners.get("mcp.changed") ?? []) handler({ pendingCount: 1 });
    };
    globalThis.glaze = {
      on: (name, handler) => {
        const entries = listeners.get(name) ?? new Set();
        entries.add(handler);
        listeners.set(name, entries);
        return () => entries.delete(handler);
      },
      rpc: async (method, params) => {
        globalThis.__mcpCalls.push({ method, params });
        if (["works.save", "works.create", "works.submitReview", "works.upload"].includes(method))
          throw new Error("AI 草稿不能直接调用平台写入");
        if (method === "works.options")
          return {
            ok: true,
            value: {
              tags: [],
              tagLimit: 5,
              peTypes: [],
              pcTypes: [],
              peSubTypes: {},
              pcSubTypes: {},
              secondTypes: {},
              recommendTags: {},
              versions: [],
              peImages: [],
              pcImages: [],
              pcTags: [],
              pcScopes: [],
              prices: [],
            },
          };
        if (method === "mcp.editDraft") {
          const draft = state.drafts[0];
          if (draft.revision !== params.revision)
            return { ok: false, error: { kind: "conflict", message: "草稿版本已变化，请重新读取预览" } };
          Object.assign(draft.patch, params.patch);
          Object.assign(draft.previewFields, params.patch);
          draft.revision++;
          for (const handler of listeners.get("mcp.changed") ?? []) handler({ pendingCount: 0 });
          return { ok: true, value: structuredClone(draft) };
        }
        if (method === "account.list") return { ok: true, value: [account] };
        if (method === "mcp.snapshot") return { ok: true, value: structuredClone(state) };
        if (method === "mcp.setEnabled") {
          state.enabled = params.enabled;
          state.status = params.enabled ? "running" : "off";
          if (params.enabled) state.port = params.port;
          state.endpoint = params.enabled ? `http://127.0.0.1:${state.port}/mcp` : null;
        }
        if (method === "mcp.grant") Object.assign(state.clients[0], params.grant);
        for (const handler of listeners.get("mcp.changed") ?? [])
          handler({ pendingCount: state.operations.filter((op) => op.state === "pending").length });
        return { ok: true, value: structuredClone(state) };
      },
    };
  });
  await page.goto(`${server.resolvedUrls.local[0]}tests/fixtures/mcp.html`);
  await page.getByText("运行中", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "mcp-settings.png"), fullPage: true });
  assert.equal(await page.getByRole("textbox", { name: "MCP 连接地址" }).inputValue(), "http://127.0.0.1:17839/mcp");
  await page.getByText("手动配置示例", { exact: true }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "MCP 连接配置" }).inputValue(),
    '[mcp_servers.glaze]\nurl = "http://127.0.0.1:17839/mcp"',
  );
  assert.equal(await page.getByRole("button", { name: "生成连接配置", exact: true }).count(), 0);
  await page.getByRole("combobox", { name: "客户端", exact: true }).selectOption("Claude Code");
  assert.equal(
    JSON.parse(await page.getByRole("textbox", { name: "MCP 连接配置" }).inputValue()).mcpServers.glaze.type,
    "http",
  );
  await page.getByText("手动配置示例", { exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "连接 AI 工具", exact: true }).count(), 0);
  const portInput = page.getByRole("textbox", { name: "MCP 端口", exact: true });
  for (const value of ["", "0", "65536", "1.5", "abc"]) {
    await portInput.fill(value);
    assert.equal(await page.getByRole("button", { name: "应用端口", exact: true }).isEnabled(), false);
  }
  await portInput.fill("17840");
  await page.getByRole("button", { name: "应用端口", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="MCP 连接地址"]').value.includes(":17840/"));
  assert.equal(await portInput.inputValue(), "17840");
  await page.screenshot({ path: join(output, "mcp-port.png"), fullPage: true });
  await page.getByRole("switch", { name: "MCP 服务", exact: true }).click();
  await page.getByText("未开启", { exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "MCP 连接地址" }).count(), 0);
  await page.getByRole("button", { name: "启用服务", exact: true }).click();
  await page.getByText("运行中", { exact: true }).waitFor();
  await page.getByRole("button", { name: "管理权限", exact: true }).click();
  const grant = page.getByRole("dialog");
  assert.equal(await grant.getByRole("checkbox", { name: "收益与结算查询", exact: true }).isChecked(), false);
  assert.equal(await grant.getByRole("checkbox", { name: "玩家评论与反馈查询", exact: true }).count(), 1);
  assert.equal(await grant.getByRole("checkbox", { name: /草稿/ }).count(), 0);
  await grant.getByRole("button", { name: "全部业务权限", exact: true }).click();
  assert.equal(await grant.getByRole("checkbox", { name: "回复玩家评论与反馈", exact: true }).isChecked(), true);
  await grant.getByRole("button", { name: "仅基础查询", exact: true }).click();
  assert.equal(await grant.getByRole("checkbox", { name: "回复玩家评论与反馈", exact: true }).isChecked(), false);
  await page.screenshot({ path: join(output, "mcp-grant.png") });
  await grant.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "查看结果", exact: true }).click();
  const review = page.getByRole("dialog");
  await review.getByText("正在保存", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "mcp-review.png") });
  assert.equal(await review.getByRole("button", { name: /确认|拒绝/ }).count(), 0);
  await page.evaluate(() => globalThis.__completeMcpOperation());
  await review.getByText("操作已完成", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => globalThis.__mcpCalls.some((call) => call.method === "mcp.decide")), false);
  await review.getByRole("button", { name: "关闭", exact: true }).click();
  await page.setViewportSize({ width: 720, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.getByRole("region", { name: "AI 草稿", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "打开作品草稿", exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log("PASS: MCP settings, grant controls, operation progress without confirmation and narrow layout");
} finally {
  await browser?.close();
  await server.close();
}
