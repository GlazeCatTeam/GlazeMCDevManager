import { join } from "node:path";
import type {
  IncomeDetailParams,
  IncomeListParams,
  McpDecision,
  McpGrant,
  McpInstallerId,
  McpLevel,
  PromotionModuleParams,
  PromotionPageParams,
  RankListParams,
  RankPageParams,
  RpcMethods,
} from "@glaze/contracts";
import { type AnalyticsDailyParams, isAnalyticsRange, isAnalyticsResourceIds, isMcpPort } from "@glaze/contracts";
import { emptyMcpData, type McpData, McpError, McpHttpServer, type McpPorts, McpService } from "@glaze/mcp";
import {
  createWork as createPlatformWork,
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
  getRankIcons,
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
import { app, BrowserWindow, dialog, Notification, safeStorage } from "electron";
import { getAboutInfo, getDependencyLicenses } from "../ipc/about";
import { changedModule } from "../ipc/data-changes";
import { sendEvent } from "../ipc/rpc";
import { uploadSelectedWorkFile } from "../ipc/work-files";
import type { LogService } from "../logs/service";
import { bundledPlugins } from "../plugins/bundled";
import type { PluginRegistry } from "../plugins/registry";
import { discoverPluginTools } from "../plugins/tools";
import { type ApplicationServices, type Broadcast, createApplicationActions } from "../preferences/actions";
import type { SessionManager } from "../session/session-manager";
import type { UpdateService } from "../update/service";
import { appWindows } from "../windows/main-window";
import { createMcpApplication } from "./application";
import { createMcpBusiness } from "./business";
import { connectClient, migrateConnections } from "./connections";
import { checkTool, connectPrompt, installTool, listInstallers, uninstallTool } from "./installers";
import { PluginToolCalls } from "./plugin-calls";
import { loadMcpData, saveMcpData } from "./store";

/** Keep ambiguous platform responses distinguishable from an explicit business rejection */
function writeResult<T>(result: Result<T>): Result<T> {
  if (!result.ok && result.error.kind === "parse") throw new McpError("parse", "平台写入响应无法确认");
  return result;
}

/** Host adapter injects business services; no synthetic Electron IPC event is used */
export function createMcpHost(
  sessions: SessionManager,
  plugins: PluginRegistry,
  changed: () => void,
  settings: Omit<ApplicationServices, "sessions" | "plugins">,
  logs: LogService,
  broadcast: Broadcast,
  update: Pick<UpdateService, "state" | "check">,
) {
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
  let http: McpHttpServer | undefined;
  let lastTools = "";
  const pluginDefinitions = discoverPluginTools(bundledPlugins, (message) => logs.write("warn", "plugins", message));
  const pluginCalls = new PluginToolCalls(
    () => {
      const win = appWindows()[0];
      if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return null;
      return { id: win.webContents.id, send: (call) => sendEvent(win, "plugins.toolCall", call) };
    },
    (id, permission) => service.allowed(id, permission),
  );
  const reads: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
    "app.getAbout": async () => getAboutInfo(),
    "app.getLicenses": async () => getDependencyLicenses(),
    "update.state": async () => update.state(),
    "update.check": () => update.check(),
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
    "rank.icons": (p) => getRankIcons(p.itemIds as string[]),
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
          p.includeIcons as boolean | undefined,
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
    if (!win || win.isDestroyed() || win.webContents.isDestroyed())
      throw new McpError("unavailable", "请先打开应用窗口");
    return win;
  };
  const application = createMcpApplication(
    createApplicationActions({ ...settings, sessions, plugins }, broadcast),
    plugins,
    logs,
    bundledPlugins,
    () => {
      const win = window();
      return {
        isMinimized: () => win.isMinimized(),
        restore: () => win.restore(),
        show: () => win.show(),
        focus: () => win.focus(),
        navigate: (payload) => sendEvent(win, "app.navigate", payload),
      };
    },
  );
  /** Recheck grants during long uploads without depending on the UI's selected account */
  const assertUpload = (clientId: string, account: string, promotion = false) => {
    const client = service.data.clients.find((entry) => entry.id === clientId);
    if (
      !service.data.enabled ||
      !client?.approved ||
      !client.accounts.includes(account) ||
      !service.allowed(clientId, promotion ? "netease:promotion.write" : "works:upload") ||
      !sessions.list().some((entry) => entry.id === account && entry.status !== "expired")
    )
      throw new McpError("forbidden", "上传授权已失效");
    plugins.assertMethodEnabled(promotion ? "promotion.upload" : "works.save");
  };
  const ports: McpPorts = {
    invokePlugin: (id, tool, params, guard, beforeWrite) => pluginCalls.invoke(id, tool, params, guard, beforeWrite),
    invoke: createMcpBusiness(sessions, application),
    save: (state) => {
      if (persistenceError) return;
      saveMcpData(file, state);
    },
    // Construction can publish changes before the service binding is initialized
    changed: () => {
      if (!data.enabled) pluginCalls.close();
      changed();
      if (http) {
        const tools = JSON.stringify([
          service.data.clients.map((client) => [client.id, client.approved, client.permissions]),
          service.definitions.map((tool) => tool.name),
        ]);
        if (tools !== lastTools) {
          lastTools = tools;
          http.changed();
        }
      }
    },
    accounts: () => sessions.list(),
    notify: (request) => {
      // The in-app dialog is enough while the user is looking at Glaze
      if (BrowserWindow.getFocusedWindow() || !Notification.isSupported()) return;
      try {
        const notification = new Notification({
          title: request.kind === "connect" ? `${request.clientName} 想连接 Glaze` : `${request.clientName} 请求权限`,
          body: `${request.reason}。点击回到 Glaze 处理。`,
        });
        notification.on("click", () => {
          const win = appWindows()[0];
          if (!win) return;
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        });
        notification.show();
      } catch {
        // Notifications are a convenience; the request stays visible in the app
      }
    },
    assertEnabled: (method) => {
      if (persistenceError) throw new McpError("unavailable", persistenceError);
      if (method.startsWith("plugin:")) {
        if (!plugins.snapshot().plugins.some((plugin) => plugin.id === method.slice(7) && plugin.enabled))
          throw new McpError("forbidden", "对应插件已停用");
        return;
      }
      const owner =
        method.startsWith("rank.") || method.startsWith("developer.")
          ? "home"
          : /^(comments|feedback)\./.test(method)
            ? "community"
            : method.split(".")[0];
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
        writeResult(await createPlatformWork(session, { account: draft.account, fields }, guard)),
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
          assertUpload(draft.clientId, draft.account, draft.purpose === "promotion");
        },
        asset.name,
      ),
    assetRoot: join(root, "materials"),
  };
  // Tell open views which platform data an AI write may have changed, including failed or uncertain writes
  const notifyChanged = <T>(module: string, write: Promise<T>): Promise<T> =>
    write.finally(() => broadcast("data.changed", { modules: [module] }));
  const writes = { invoke: ports.invoke, saveWork: ports.saveWork, createWork: ports.createWork, review: ports.review };
  if (writes.invoke) {
    const invokeBusiness = writes.invoke;
    ports.invoke = (method, params, guard, beforeWrite) => {
      const module = changedModule(method);
      const call = invokeBusiness(method, params, guard, beforeWrite);
      return module ? notifyChanged(module, call) : call;
    };
  }
  ports.saveWork = (...args) => notifyChanged("works", writes.saveWork(...args));
  ports.createWork = (...args) => notifyChanged("works", writes.createWork(...args));
  ports.review = (...args) => notifyChanged("works", writes.review(...args));
  const service = new McpService(data, ports);
  /** Publish only enabled contributions and notify connected clients when switches change */
  const refreshPluginTools = () => {
    const enabled = new Set(
      plugins
        .snapshot()
        .plugins.filter((plugin) => plugin.enabled)
        .map((plugin) => plugin.id),
    );
    service.setPluginTools(pluginDefinitions.filter((tool) => tool.plugin && enabled.has(tool.plugin.pluginId)));
  };
  refreshPluginTools();
  const cleanup = setInterval(() => {
    void service.cleanupMaterials().catch(() => undefined);
  }, 15 * 60_000);
  cleanup.unref();
  void service.cleanupMaterials().catch(() => undefined);
  let transport = new McpHttpServer(service);
  http = transport;
  if (persistenceError) {
    service.status = "error";
    service.error = persistenceError;
  }
  let changing = false;
  /** Apply a validated port while keeping an existing listener alive if binding fails */
  const setEnabled = async (enabled: boolean, port = service.data.port) => {
    if (typeof enabled !== "boolean") throw new McpError("validation", "服务开关无效");
    if (!isMcpPort(port)) throw new McpError("validation", "端口必须是 1 到 65535 之间的整数");
    if (persistenceError) throw new McpError("unavailable", persistenceError);
    if (changing) throw new McpError("busy", "服务正在切换状态");
    changing = true;
    try {
      if (!enabled) {
        service.disable();
        await transport.stop();
        service.error = null;
        service.commit();
        return service.snapshot();
      }
      if (service.status === "running" && port === service.data.port) {
        service.error = null;
        service.commit();
        return service.snapshot();
      }
      const wasRunning = service.status === "running";
      if (!wasRunning) service.status = "starting";
      service.error = null;
      service.commit();
      const previousEndpoint = service.endpoint;
      const next = new McpHttpServer(service);
      try {
        await next.start(port);
      } catch (error) {
        if (!wasRunning) {
          service.data.enabled = false;
          service.status = "error";
        }
        service.error =
          error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE"
            ? `端口 ${port} 已被占用，请更换端口后重试${wasRunning ? "；原连接仍可使用" : ""}`
            : `MCP 启动失败，请检查端口 ${port}${wasRunning ? "；原连接仍可使用" : ""}`;
        service.commit();
        return service.snapshot();
      }
      // Starting a candidate listener updates the shared endpoint before the transaction commits
      service.endpoint = previousEndpoint;
      const portChanged = service.data.port !== port;
      if (portChanged) {
        try {
          await migrateConnections(
            service.data.clients,
            previousEndpoint ?? `http://127.0.0.1:${service.data.port}/mcp`,
            next.endpoint,
          );
        } catch (error) {
          await next.stop();
          service.endpoint = previousEndpoint;
          service.status = wasRunning ? "running" : "error";
          service.error = `${error instanceof McpError ? error.message : "端口切换失败"}${wasRunning ? "；服务仍在原端口运行" : ""}`;
          service.commit();
          return service.snapshot();
        }
      }
      service.disable();
      await transport.stop();
      transport = next;
      http = next;
      service.endpoint = next.endpoint;
      service.data.port = port;
      service.data.enabled = true;
      service.status = "running";
      service.commit();
      return service.snapshot();
    } finally {
      changing = false;
    }
  };
  const handlers = {
    "mcp.clearAudit": () => {
      service.clearAudit();
      return undefined;
    },
    "mcp.resolveOperation": (params: { operationId: string }) => {
      service.resolveOperation(params?.operationId);
      return undefined;
    },
    "mcp.snapshot": async () => {
      const snapshot = service.snapshot();
      // Other programs may rewrite their own config files and drop the entry Glaze added
      const missing = await Promise.all(
        service.data.clients.map(async (client) =>
          client.key && client.tool && client.tool !== "other"
            ? (await checkTool(
                client.tool,
                `${snapshot.endpoint ?? `http://127.0.0.1:${snapshot.port}/mcp`}?key=${client.key}`,
              )) !== true
            : false,
        ),
      );
      const flagged = new Set(service.data.clients.filter((_, index) => missing[index]).map((client) => client.id));
      return {
        ...snapshot,
        clients: snapshot.clients.map((client) =>
          flagged.has(client.id) ? { ...client, configMissing: true } : client,
        ),
      };
    },
    "mcp.repair": async (params: { clientId: string }) => {
      const client = service.data.clients.find((entry) => entry.id === params?.clientId);
      if (!client?.key || !client.tool || client.tool === "other" || !service.endpoint)
        throw new McpError("validation", "这个连接不能自动修复，请重新连接");
      await installTool(client.tool, `${service.endpoint}?key=${client.key}`);
      changed();
      return undefined;
    },
    "mcp.setEnabled": (params: RpcMethods["mcp.setEnabled"]["params"]) => setEnabled(params?.enabled, params?.port),
    "mcp.grant": (params: { clientId: string; grant: McpGrant }) => {
      service.grant(params?.clientId, params?.grant);
      return service.snapshot();
    },
    "mcp.disconnect": (params: { clientId: string }) => {
      service.disconnect(params?.clientId);
      return undefined;
    },
    "mcp.revoke": async (params: { clientId: string }) => {
      if (!/^[\da-f-]{36}$/.test(params?.clientId)) throw new McpError("validation", "客户端 ID 无效");
      const removed = service.revoke(params?.clientId);
      if (removed?.key && removed.tool) await uninstallTool(removed.tool, removed.key);
      return undefined;
    },
    "mcp.installers": () => listInstallers(),
    "mcp.connect": async (params: { tool: McpInstallerId; level: McpLevel }) => {
      const installer = (await listInstallers()).find((entry) => entry.id === params?.tool);
      if (!installer) throw new McpError("validation", "不支持这个 AI 工具");
      if (!["view", "assist", "full"].includes(params?.level)) throw new McpError("validation", "请选择权限档位");
      if (!sessions.list().some((account) => account.status !== "expired"))
        throw new McpError("validation", "请先登录至少一个网易开发者账号");
      if (service.status !== "running") {
        const state = await setEnabled(true);
        if (state.status !== "running") throw new McpError("unavailable", state.error ?? "AI 连接服务启动失败");
      }
      const { client, key, installed, message } = await connectClient(
        service,
        installer.name,
        installer.id,
        params.level,
      );
      const endpoint = `${service.endpoint}?key=${key}`;
      return { clientId: client.id, installed, message, endpoint, prompt: connectPrompt(endpoint) };
    },
    "mcp.answer": (params: { requestId: string; decision: McpDecision }) => {
      service.answer(params?.requestId, params?.decision);
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
  };
  return {
    service,
    handlers,
    refreshPluginTools,
    /** Accept results only from a current main window after the RPC frame check */
    pluginToolResult: (sender: number, input: unknown) => {
      if (!appWindows().some((win) => !win.isDestroyed() && win.webContents.id === sender))
        throw new McpError("forbidden", "插件工具结果只允许主窗口返回");
      pluginCalls.result(sender, input);
    },
    start: () => (data.enabled ? setEnabled(true) : Promise.resolve(service.snapshot())),
    stop: () => {
      clearInterval(cleanup);
      pluginCalls.close();
      return transport.stop();
    },
  };
}
export type McpHost = ReturnType<typeof createMcpHost>;
