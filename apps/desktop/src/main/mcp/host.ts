import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  IncomeDetailParams,
  IncomeListParams,
  McpGrant,
  PromotionModuleParams,
  PromotionPageParams,
  RankListParams,
  RankPageParams,
  RpcMethods,
} from "@glaze/contracts";
import { type AnalyticsDailyParams, isAnalyticsRange, isAnalyticsResourceIds } from "@glaze/contracts";
import { emptyMcpData, type McpData, McpError, McpPipeServer, type McpPorts, McpService } from "@glaze/mcp";
import {
  createWork,
  estimateIncome,
  getAnalyticsDaily,
  getAnalyticsOverview,
  getDeveloperLevel,
  getIncomeDetail,
  getIncomeList,
  getPromotionActivities,
  getPromotionApplications,
  getPromotionDates,
  getPromotionDiscount,
  getPromotionModule,
  getRankList,
  getRankPage,
  getReviewFeedback,
  getWork,
  getWorkEditorOptions,
  listWorks,
  monthOf,
  parseMonth,
  type Result,
  readWorkEditor,
  saveWorkEditor,
  submitWorkReview,
  validateWorkAdvanced,
  validateWorkCreate,
  validateWorkPatch,
} from "@glaze/netease";
import { app, dialog, safeStorage } from "electron";
import { uploadSelectedWorkFile } from "../ipc/work-files";
import type { PluginRegistry } from "../plugins/registry";
import type { SessionManager } from "../session/session-manager";
import { appWindows } from "../windows/main-window";
import { bridgeCredential } from "./credential";
import { loadMcpData, saveMcpData } from "./store";

/** Keep ambiguous platform responses distinguishable from an explicit business rejection */
function writeResult<T>(result: Result<T>): Result<T> {
  if (!result.ok && result.error.kind === "parse") throw new McpError("parse", "平台写入响应无法确认");
  return result;
}

/** Host adapter injects business services; no synthetic Electron IPC event is used */
export function createMcpHost(sessions: SessionManager, plugins: PluginRegistry, changed: () => void) {
  const root = join(app.getPath("userData"), "mcp");
  const file = join(root, "state.bin");
  let persistenceError: string | null = null;
  let data: McpData;
  try {
    data = loadMcpData(file);
  } catch {
    data = emptyMcpData();
    persistenceError = "MCP 授权文件无法读取，服务已停用；原文件已保留";
  }
  if (!safeStorage.isEncryptionAvailable()) persistenceError = "Windows 系统加密不可用，MCP 服务已停用";
  let pipe: McpPipeServer | undefined;
  let lastTools = "";
  const reads: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
    "developer.level": (p) => sessions.request(p.account as string, getDeveloperLevel),
    "analytics.overview": (p) => sessions.request(p.account as string, getAnalyticsOverview),
    "analytics.daily": (p) => {
      if (!isAnalyticsRange(p) || !isAnalyticsResourceIds(p.resourceIds))
        throw new McpError("validation", "分析日期或资源参数无效");
      return sessions.request(p.account as string, (session) =>
        getAnalyticsDaily(session, p as unknown as AnalyticsDailyParams),
      );
    },
    "works.list": (p) =>
      sessions.request(p.account as string, (session) => listWorks(session, (p.platform as "pe" | "pc") ?? "pe")),
    "works.get": (p) => sessions.request(p.account as string, (session) => getWork(session, p.itemId as string)),
    "works.reviewFeedback": (p) =>
      sessions.request(p.account as string, (session) => getReviewFeedback(session, p.itemId as string)),
    "rank.list": (p) =>
      sessions.request(p.account as string, (session) =>
        getRankList(
          session,
          (p as unknown as RankListParams).board,
          (p as unknown as RankListParams).category ?? "mod",
          (p.limit as number) ?? 10,
        ),
      ),
    "rank.page": (p) =>
      sessions.request(p.account as string, (session) =>
        getRankPage(
          session,
          (p as unknown as RankPageParams).board,
          (p as unknown as RankPageParams).category ?? "mod",
          (p.start as number) ?? 0,
          (p.limit as number) ?? 50,
        ),
      ),
    "income.list": (p) =>
      sessions.request(p.account as string, (session) => getIncomeList(session, p as unknown as IncomeListParams)),
    "income.detail": (p) =>
      sessions.request(p.account as string, (session) => getIncomeDetail(session, p as unknown as IncomeDetailParams)),
    "income.estimate": (p) => {
      const month = parseMonth((p.month as string) ?? monthOf(new Date()));
      if (!month) throw new McpError("validation", "月份无效");
      return sessions.request(p.account as string, (session) =>
        estimateIncome(session, (p.month as string) ?? monthOf(new Date())),
      );
    },
    "promotion.activities": (p) =>
      sessions.request(p.account as string, (session) =>
        getPromotionActivities(session, p as unknown as PromotionPageParams),
      ),
    "promotion.discount": (p) => sessions.request(p.account as string, getPromotionDiscount),
    "promotion.dates": (p) => sessions.request(p.account as string, getPromotionDates),
    "promotion.module": (p) =>
      sessions.request(p.account as string, (session) =>
        getPromotionModule(session, p as unknown as PromotionModuleParams),
      ),
    "promotion.applications": (p) =>
      sessions.request(p.account as string, (session) =>
        getPromotionApplications(session, p as unknown as PromotionPageParams),
      ),
  };
  /** Require an existing main window for every native choice and trusted approval */
  const window = () => {
    const win = appWindows()[0];
    if (!win) throw new McpError("unavailable", "请先打开应用窗口");
    return win;
  };
  /** Recheck grants during long uploads without depending on the UI's selected account */
  const assertUpload = (clientId: string, account: string) => {
    const client = service.data.clients.find((entry) => entry.id === clientId);
    if (
      !service.data.enabled ||
      !client?.approved ||
      !client.accounts.includes(account) ||
      !client.permissions.includes("works:upload") ||
      !sessions.list().some((entry) => entry.id === account && entry.status !== "expired")
    )
      throw new McpError("forbidden", "上传授权已失效");
    plugins.assertMethodEnabled("works.save");
  };
  const ports: McpPorts = {
    save: (state) => {
      if (persistenceError) return;
      saveMcpData(file, state);
    },
    changed: () => {
      changed();
      if (pipe) {
        const tools = JSON.stringify(
          service.data.clients.map((client) => [client.id, client.approved, client.permissions]),
        );
        if (tools !== lastTools) {
          lastTools = tools;
          pipe.changed();
        }
      }
    },
    accounts: () => sessions.list(),
    assertEnabled: (method) => {
      if (persistenceError) throw new McpError("unavailable", persistenceError);
      const owner = method.startsWith("rank.") || method.startsWith("developer.") ? "home" : method.split(".")[0];
      if (
        owner &&
        !["app", "account"].includes(owner) &&
        !plugins.snapshot().plugins.find((plugin) => plugin.id === `glaze.${owner}`)?.enabled
      )
        throw new McpError("forbidden", "对应插件已停用");
      plugins.assertMethodEnabled(method);
    },
    read: async (method, params) => {
      const read = reads[method];
      if (!read) throw new McpError("unknown_tool", "读取能力未注册");
      return read(params);
    },
    editor: (account, itemId) => sessions.request(account, (session) => readWorkEditor(session, itemId)),
    options: (account) => sessions.request(account, getWorkEditorOptions),
    validate: async (draft, patch) => {
      const options = await sessions.request(draft.account, getWorkEditorOptions);
      const message = draft.itemId
        ? (validateWorkPatch(patch, draft.document.fields) ??
          validateWorkAdvanced(patch, draft.document.fields, options, draft.itemId))
        : validateWorkCreate({ ...draft.document.fields, ...patch }, options);
      return message ? [{ field: Object.keys(patch).find((key) => message.includes(key)) ?? "作品", message }] : [];
    },
    saveWork: (draft, patch, guard) =>
      sessions.request(draft.account, async (session) =>
        writeResult(
          await saveWorkEditor(
            session,
            {
              account: draft.account,
              itemId: draft.itemId ?? "",
              patch,
              base: Object.fromEntries(Object.keys(patch).map((key) => [key, draft.document.fields[key] ?? null])),
            },
            guard,
          ),
        ),
      ),
    createWork: (draft, fields, guard) =>
      sessions.request(draft.account, async (session) =>
        writeResult(await createWork(session, { account: draft.account, fields }, guard)),
      ),
    review: (account, itemId, expected, guard) =>
      sessions.request(account, async (session) =>
        writeResult(await submitWorkReview(session, itemId, expected, guard)),
      ),
    pickFile: async () => {
      const selected = await dialog.showOpenDialog(window(), {
        title: "为 AI 草稿选择材料（尚未上传）",
        properties: ["openFile"],
      });
      return selected.canceled ? null : (selected.filePaths[0] ?? null);
    },
    upload: (draft, asset, guard) =>
      uploadSelectedWorkFile(
        sessions,
        window(),
        {
          account: draft.account,
          ...(draft.itemId ? { itemId: draft.itemId } : {}),
          kind: asset.kind,
          platform: asset.platform,
          ...(asset.channelId === undefined ? {} : { channelId: asset.channelId }),
          ...(asset.resourceType === undefined ? {} : { resourceType: asset.resourceType }),
        },
        asset.path,
        () => {
          guard();
          assertUpload(draft.clientId, draft.account);
        },
        asset.name,
      ),
    assetRoot: join(root, "materials"),
  };
  const service = new McpService(data, ports);
  const cleanup = setInterval(() => {
    void service.cleanupMaterials().catch(() => undefined);
  }, 15 * 60_000);
  cleanup.unref();
  void service.cleanupMaterials().catch(() => undefined);
  const transport = new McpPipeServer(service);
  pipe = transport;
  if (persistenceError) {
    service.status = "error";
    service.error = persistenceError;
  }
  let changing = false;
  /** Reflect actual listener state and keep enable/disable operations serialized */
  const setEnabled = async (enabled: boolean) => {
    if (typeof enabled !== "boolean") throw new McpError("validation", "服务开关无效");
    if (persistenceError) throw new McpError("unavailable", persistenceError);
    if (changing) throw new McpError("busy", "服务正在切换状态");
    changing = true;
    try {
      if (!enabled) {
        service.disable();
        await transport.stop();
        return service.snapshot();
      }
      service.status = "starting";
      service.error = null;
      service.commit();
      try {
        const endpoint = await transport.start();
        mkdirSync(root, { recursive: true });
        writeFileSync(join(root, "endpoint"), endpoint, { mode: 0o600 });
        service.data.enabled = true;
        service.status = "running";
        service.commit();
      } catch {
        await transport.stop();
        service.data.enabled = false;
        service.status = "error";
        service.error = "MCP 启动失败，请检查本机管道与系统加密服务";
        service.commit();
      }
      return service.snapshot();
    } finally {
      changing = false;
    }
  };
  const handlers = {
    "mcp.resolveOperation": (params: { operationId: string }) => {
      service.resolveOperation(params?.operationId);
      return undefined;
    },
    "mcp.snapshot": () => service.snapshot(),
    "mcp.setEnabled": (params: RpcMethods["mcp.setEnabled"]["params"]) => setEnabled(params?.enabled),
    "mcp.invite": (params: RpcMethods["mcp.invite"]["params"]) => {
      const client = service.invite(params?.name);
      try {
        writeFileSync(join(root, `${client.id}.dpapi`), bridgeCredential(client.token, false), { mode: 0o600 });
      } catch (error) {
        service.revoke(client.id);
        throw error;
      }
      return {
        clientId: client.id,
        command: process.execPath,
        args: [join(import.meta.dirname, "mcp-bridge.js"), "--mcp-root", root, "--mcp-client", client.id],
        env: { ELECTRON_RUN_AS_NODE: "1" },
        expiresAt: client.expiresAt,
      };
    },
    "mcp.grant": (params: { clientId: string; grant: McpGrant }) => {
      service.grant(params?.clientId, params?.grant);
      return service.snapshot();
    },
    "mcp.disconnect": (params: { clientId: string }) => {
      service.disconnect(params?.clientId);
      return undefined;
    },
    "mcp.revoke": (params: { clientId: string }) => {
      if (!/^[\da-f-]{36}$/.test(params?.clientId)) throw new McpError("validation", "客户端 ID 无效");
      service.revoke(params?.clientId);
      rmSync(join(root, `${params.clientId}.dpapi`), { force: true });
      return undefined;
    },
    "mcp.directory": async (params: RpcMethods["mcp.directory"]["params"]) => {
      if (params?.removeId) {
        service.directory(params.clientId, null, params.removeId);
        return undefined;
      }
      const selected = await dialog.showOpenDialog(window(), {
        title: "授权 AI 读取素材目录",
        properties: ["openDirectory"],
      });
      if (!selected.canceled && selected.filePaths[0]) service.directory(params.clientId, selected.filePaths[0]);
      return undefined;
    },
    "mcp.decide": async (params: RpcMethods["mcp.decide"]["params"]) => {
      if (!params || typeof params.approve !== "boolean" || !Number.isInteger(params.revision))
        throw new McpError("validation", "确认参数无效");
      await service.decide(params.operationId, params.revision, params.approve);
      return undefined;
    },
    "mcp.editDraft": (params: RpcMethods["mcp.editDraft"]["params"]) =>
      service.editDraft(params?.draftId, params?.revision, params?.patch),
  };
  return {
    service,
    handlers,
    start: () => (data.enabled ? setEnabled(true) : Promise.resolve(service.snapshot())),
    stop: () => {
      clearInterval(cleanup);
      return transport.stop();
    },
  };
}
export type McpHost = ReturnType<typeof createMcpHost>;
