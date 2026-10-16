import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { basename } from "node:path";
import {
  emptyWorkCreateFields,
  isWorkRecord,
  isWorkValue,
  type McpAccessRequest,
  type McpAction,
  type McpDecision,
  type McpDraft,
  type McpGrant,
  type McpInstallerId,
  type McpLevel,
  type McpOperation,
  type McpPermission,
  type McpSnapshot,
  mcpLevelOf,
  mcpLevels,
  mcpPermissionLabels,
  mcpPermissions,
  type WorkRecord,
  type WorkValue,
  workSections,
} from "@glaze/contracts";
import sanitizeHtml from "sanitize-html";
import { cleanMaterials, resolveMaterial, snapshotMaterial, verifyMaterial } from "./assets";
import {
  canonical,
  type McpData,
  McpError,
  type McpPorts,
  publicValue,
  type StoredAsset,
  type StoredClient,
  type StoredOperation,
} from "./model";
import { type ToolDefinition, toolDefinitions } from "./tools";

type AccessOutcome = McpDecision | "timeout";
interface PendingAccess {
  request: McpAccessRequest;
  waiters: Set<(outcome: AccessOutcome) => void>;
}

const editStates = new Set(["init", "online", "reject", "offline", "system_offline"]);
const mediaKeys = new Set(["res_url", "channel_url", "banner_pic", "corp_proof_image", "url", "cover"]);

/** Own grants, isolated drafts and durable approvals independently of Electron or the protocol */
export class McpService {
  status: McpSnapshot["status"] = "off";
  error: string | null = null;
  endpoint: string | null = null;
  readonly connections = new Map<string, Set<() => void>>();
  private readonly calls = new Set<string>();
  private importing = false;
  private readonly writes = new Set<string>();
  private readonly epochs = new Map<string, number>();
  private readonly rates = new Map<string, number[]>();
  private readonly access = new Map<string, PendingAccess>();
  /** One-shot permissions granted with "only this time", consumed by the next matching call */
  private readonly once = new Map<string, Set<McpPermission>>();
  /** How long a tool call waits for the user to answer an access request before reporting it pending */
  accessWaitMs = 60_000;
  readonly definitions = toolDefinitions();

  constructor(
    readonly data: McpData,
    private readonly ports: McpPorts,
  ) {
    for (const operation of data.operations) {
      if (operation.state === "running") {
        operation.state = "unknown";
        operation.message = "应用重启，执行结果待核实，禁止自动重试";
      } else if (operation.state === "pending") {
        operation.state = "expired";
        operation.message = "应用重启，原批准请求已失效";
      }
    }
    for (const draft of data.drafts)
      draft.locked = data.operations.some(
        (operation) =>
          operation.draftId === draft.id &&
          (["unknown", "created_id_unresolved", "platform_action"].includes(operation.state) ||
            (operation.state !== "succeeded" && isWorkRecord(operation.result) && operation.result.saved === true)),
      );
    this.pruneSnapshots();
  }

  /** Persist before notifying views; callers must not perform a write if persistence fails */
  commit(): void {
    this.ports.save(this.data);
    this.ports.changed();
  }

  /** Bound material storage independently of audit-log retention */
  async cleanupMaterials(): Promise<void> {
    const now = Date.now();
    const active = new Set(
      this.data.operations.filter((operation) => operation.state === "running").map((operation) => operation.assetId),
    );
    const kept = this.data.assets.filter((asset) => asset.expiresAt > now || active.has(asset.id));
    await cleanMaterials(this.ports.assetRoot, new Set(kept.map((asset) => basename(asset.path))), now);
    // Imports may finish while cleanup is awaiting filesystem operations
    this.data.assets = this.data.assets.filter((asset) => asset.expiresAt > now || active.has(asset.id));
    this.commit();
  }

  /** Return only UI-safe state, retaining neither local paths nor client credentials */
  snapshot(): McpSnapshot {
    this.expire();
    return {
      port: this.data.port,
      enabled: this.data.enabled,
      status: this.status,
      error: this.error,
      endpoint: this.endpoint,
      clients: this.data.clients.map(({ token: _token, key, directories, ...client }) => ({
        ...client,
        persistent: !!key,
        connected: !!this.connections.get(client.id)?.size,
        directories: directories.map(({ id, name }) => ({ id, name })),
      })),
      requests: [...this.access.values()].map(({ request }) => structuredClone(request)),
      operations: this.data.operations.map((operation) => this.operationView(operation)),
      drafts: this.data.drafts.map((draft) => {
        try {
          return {
            ...structuredClone(draft),
            previewFields: { ...draft.document.fields, ...this.resolvePatch(draft, draft.patch) },
          };
        } catch {
          return structuredClone(draft);
        }
      }),
      assets: this.data.assets.map(({ path: _path, receipt: _receipt, ...asset }) => asset),
      audit: structuredClone(this.data.audit),
    };
  }

  /** Expire pending business approvals without reviving them on reconnect */
  private expire(): void {
    let changed = false;
    for (const [id, entry] of this.access)
      if (entry.request.expiresAt < Date.now()) {
        this.access.delete(id);
        for (const resolve of entry.waiters) resolve("timeout");
        changed = true;
      }
    for (const operation of this.data.operations)
      if (operation.state === "pending" && operation.expiresAt < Date.now()) {
        operation.state = "expired";
        operation.message = "请求已过期，请重新检查内容";
        changed = true;
      }
    if (changed) this.commit();
  }

  /** Register a fresh HTTP connection without trusting a client-supplied identity */
  registerClient(name: string): StoredClient {
    if (!this.data.enabled || this.status !== "running") throw new McpError("unavailable", "请先开启 MCP 服务");
    if (typeof name !== "string" || !name.trim() || name.length > 80)
      throw new McpError("validation", "客户端名称无效");
    // A new session never resumes an old grant; retain offline clients only when drafts reference them
    this.data.clients = this.data.clients.filter(
      (client) =>
        client.key ||
        this.connections.get(client.id)?.size ||
        this.data.drafts.some((draft) => draft.clientId === client.id),
    );
    if (this.data.clients.length >= 50) throw new McpError("limit", "客户端数量已达上限，请撤销不用的客户端");
    const client: StoredClient = {
      id: randomUUID(),
      name: name.trim(),
      accounts: [],
      defaultAccount: "",
      permissions: [],
      approved: false,
      lastSeen: null,
      expiresAt: Date.now() + 10 * 60_000,
      directories: [],
    };
    this.data.clients.push(client);
    this.commit();
    return client;
  }

  /** Create a trusted client from the app's one-click connect; its key identifies it on every reconnect */
  createKeyedClient(name: string, tool: McpInstallerId, level: McpLevel): { client: StoredClient; key: string } {
    if (this.data.clients.length >= 50) throw new McpError("limit", "已连接的 AI 工具太多，请先移除不用的");
    const key = randomBytes(24).toString("base64url");
    const client: StoredClient = {
      id: randomUUID(),
      name,
      tool,
      key,
      ...this.defaultGrant(mcpLevels[level].permissions),
      approved: true,
      lastSeen: null,
      expiresAt: Number.MAX_SAFE_INTEGER,
      directories: [],
    };
    this.data.clients.push(client);
    this.commit();
    return { client, key };
  }

  /** Resolve a connection key in constant time; unknown keys never fall back to pairing */
  clientByKey(key: string): StoredClient | undefined {
    const given = Buffer.from(key);
    return this.data.clients.find((client) => {
      if (!client.key) return false;
      const stored = Buffer.from(client.key);
      return stored.length === given.length && timingSafeEqual(stored, given);
    });
  }

  /** Grant every usable account, defaulting to the one shown in the app */
  private defaultGrant(permissions: McpPermission[]): McpGrant {
    const usable = this.ports.accounts().filter((account) => account.status !== "expired");
    const fallback = usable.find((account) => account.current) ?? usable[0];
    return {
      accounts: usable.map((account) => account.id),
      defaultAccount: fallback?.id ?? "",
      permissions: [...permissions],
    };
  }

  /** Ask the user, through the app, to let a manually configured tool connect */
  requestConnect(id: string): void {
    const client = this.client(id, false);
    if (client.approved || [...this.access.values()].some((entry) => entry.request.clientId === id)) return;
    this.openRequest(client, "connect", mcpLevels.assist.permissions, "想要连接 Glaze，帮你管理作品与数据");
    this.commit();
  }

  /** Reuse an identical open request so repeated AI retries show a single prompt */
  private openRequest(
    client: StoredClient,
    kind: McpAccessRequest["kind"],
    permissions: McpPermission[],
    reason: string,
  ): PendingAccess {
    const key = [...permissions].sort().join(",");
    for (const entry of this.access.values())
      if (
        entry.request.clientId === client.id &&
        entry.request.kind === kind &&
        [...entry.request.permissions].sort().join(",") === key
      )
        return entry;
    if ([...this.access.values()].filter((entry) => entry.request.clientId === client.id).length >= 5)
      throw new McpError("rate_limited", "缺少权限，且已有多条授权请求在等用户处理，请先提醒用户在 Glaze 中处理");
    const entry: PendingAccess = {
      request: {
        id: randomUUID(),
        clientId: client.id,
        clientName: client.name,
        kind,
        permissions,
        reason: reason.slice(0, 200),
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60_000,
      },
      waiters: new Set(),
    };
    this.access.set(entry.request.id, entry);
    this.ports.notify?.(entry.request);
    return entry;
  }

  /** Wait briefly for the user's answer so a granted call can continue without the AI retrying */
  private waitFor(entry: PendingAccess): Promise<AccessOutcome> {
    if (this.accessWaitMs <= 0) return Promise.resolve("timeout");
    return new Promise((resolve) => {
      const done = (outcome: AccessOutcome) => {
        clearTimeout(timer);
        entry.waiters.delete(done);
        resolve(outcome);
      };
      const timer = setTimeout(() => done("timeout"), this.accessWaitMs);
      timer.unref?.();
      entry.waiters.add(done);
    });
  }

  /** Apply the user's answer from the trusted UI and release any waiting tool call */
  answer(requestId: string, decision: McpDecision): void {
    const entry = this.access.get(requestId);
    if (!entry) throw new McpError("expired", "这条请求已处理或已过期");
    if (!["always", "once", "deny"].includes(decision)) throw new McpError("validation", "请选择允许或拒绝");
    const client = this.client(entry.request.clientId, false);
    if (decision !== "deny") {
      if (entry.request.kind === "connect") {
        const grant = this.defaultGrant(entry.request.permissions);
        if (!grant.accounts.length) throw new McpError("validation", "请先在 Glaze 登录至少一个账号");
        this.invalidate(client.id, "客户端权限已变化");
        Object.assign(client, grant, { approved: true });
      } else if (decision === "always") {
        client.permissions = [...new Set([...client.permissions, ...entry.request.permissions])];
      } else if (!entry.waiters.size) {
        // The call already returned; let the AI's retry use this one-time grant
        const set = this.once.get(client.id) ?? new Set();
        for (const permission of entry.request.permissions) set.add(permission);
        this.once.set(client.id, set);
      }
    }
    this.access.delete(requestId);
    for (const resolve of [...entry.waiters]) resolve(decision);
    this.commit();
  }

  /** Number of access requests waiting for the user */
  requestCount(): number {
    return this.access.size;
  }

  /** Whether a client may use a permission now, counting a live one-time grant */
  allowed(id: string, permission: string): boolean {
    const client = this.data.clients.find((entry) => entry.id === id);
    return (
      !!client?.approved &&
      (client.permissions.includes(permission as McpPermission) ||
        !!this.once.get(id)?.has(permission as McpPermission))
    );
  }

  /** Describe the connection for the AI in plain language, before or after approval */
  describe(id: string) {
    const client = this.client(id, false);
    const accounts = this.ports.accounts();
    const missing = mcpPermissions.filter(
      (permission) => permission !== "works:draft" && !client.permissions.includes(permission),
    );
    const level = mcpLevelOf(client.permissions);
    return {
      app: "Glaze MC Dev Manager（网易我的世界开发者管理工具）",
      tool: client.name,
      approved: client.approved,
      waitingForUser: [...this.access.values()].some((entry) => entry.request.clientId === id),
      level: client.approved ? (level === "custom" ? "自定义" : mcpLevels[level].title) : null,
      accounts: accounts
        .filter((account) => client.accounts.includes(account.id))
        .map((account) => ({
          id: account.id,
          nickname: account.nickname,
          default: account.id === client.defaultAccount,
          loggedIn: account.status !== "expired",
        })),
      canDo: client.permissions.filter((p) => p !== "works:draft").map((p) => mcpPermissionLabels[p]),
      needsPermission: missing.map((permission) => ({ permission, label: mcpPermissionLabels[permission] })),
      hint: client.approved
        ? "直接调用需要的工具即可。缺少权限时 Glaze 会弹窗询问用户，用户允许后调用会自动继续。"
        : "用户还没有允许连接。请告诉用户：在 Glaze 窗口弹出的提示中点击「允许」，或在 Glaze 侧边栏「AI 助手」里一键连接。",
    };
  }

  /** Let the AI ask for a level or specific permissions with a reason shown to the user */
  async requestAccessTool(id: string, input: unknown) {
    const params = (input ?? {}) as { level?: unknown; permissions?: unknown; reason?: unknown };
    const reason = typeof params.reason === "string" && params.reason.trim() ? params.reason.trim() : "需要更多权限";
    const client = this.client(id, false);
    if (!client.approved) {
      this.requestConnect(id);
      const entry = [...this.access.values()].find((item) => item.request.clientId === id);
      const outcome = entry ? await this.waitFor(entry) : "timeout";
      return { outcome, status: this.describe(id) };
    }
    let wanted: McpPermission[] = [];
    if (typeof params.level === "string" && Object.hasOwn(mcpLevels, params.level))
      wanted = mcpLevels[params.level as McpLevel].permissions;
    if (Array.isArray(params.permissions))
      wanted = [
        ...wanted,
        ...params.permissions.filter(
          (p): p is McpPermission => mcpPermissions.includes(p as McpPermission) && p !== "works:draft",
        ),
      ];
    const missing = [...new Set(wanted)].filter((permission) => !client.permissions.includes(permission));
    if (!missing.length) return { outcome: "always", status: this.describe(id) };
    const entry = this.openRequest(client, "permission", missing, reason);
    this.commit();
    const outcome = await this.waitFor(entry);
    // An advance "only this time" must survive until the AI's actual call
    if (outcome === "once") {
      const set = this.once.get(id) ?? new Set();
      for (const permission of missing) set.add(permission);
      this.once.set(id, set);
    }
    return { outcome, status: this.describe(id) };
  }

  /** Ask for a missing permission during a call; returns once the user answers or the wait ends */
  private async ensurePermission(id: string, tool: ToolDefinition): Promise<void> {
    const permission = tool.permission as McpPermission | null;
    const client = this.client(id);
    if (!permission || this.allowed(id, permission)) return;
    const entry = this.openRequest(client, "permission", [permission], `调用「${tool.title}」`);
    this.commit();
    const outcome = await this.waitFor(entry);
    if (outcome === "deny") throw new McpError("forbidden", `用户拒绝了「${mcpPermissionLabels[permission]}」权限`);
    if (outcome === "timeout")
      throw new McpError(
        "permission_pending",
        `缺少「${mcpPermissionLabels[permission]}」权限，已在 Glaze 弹窗请求用户授权。请提醒用户在 Glaze 窗口中点击「允许」后再试一次。`,
      );
    if (outcome === "once") {
      const set = this.once.get(id) ?? new Set();
      set.add(permission);
      this.once.set(id, set);
    }
  }

  /** List every tool for approved clients so the AI knows what it can ask for */
  catalog(id: string): { tool: ToolDefinition; granted: boolean }[] {
    if (!this.data.clients.find((entry) => entry.id === id)?.approved) return [];
    return this.definitions.map((tool) => ({
      tool,
      granted: tool.permission === null || this.allowed(id, tool.permission),
    }));
  }

  /** Keep a keyed client's grant when one of its sessions ends; other sessions stay connected */
  sessionClosed(id: string): void {
    if (!this.connections.get(id)?.size) this.invalidate(id, "连接已断开");
    this.commit();
  }

  /** Drop a client created for a session that never finished initializing */
  discardTransient(id: string): void {
    const client = this.data.clients.find((entry) => entry.id === id);
    if (client && !client.key) this.revoke(id);
  }

  /** Track live HTTP sessions separately from persistent authorization */
  connected(id: string, close: () => void): () => void {
    const set = this.connections.get(id) ?? new Set();
    set.add(close);
    this.connections.set(id, set);
    const client = this.data.clients.find((entry) => entry.id === id);
    if (client) client.lastSeen = new Date().toISOString();
    this.commit();
    return () => {
      set.delete(close);
      if (!set.size) this.connections.delete(id);
      this.ports.changed();
    };
  }

  /** Trusted UI grants a fixed account set and explicit business permissions */
  grant(id: string, grant: McpGrant): void {
    const client = this.client(id, false);
    if (!client.approved && (!this.connections.get(id)?.size || client.expiresAt < Date.now()))
      throw new McpError("forbidden", "请先连接客户端，授权等待已过期时请重新连接");
    if (
      !grant ||
      !Array.isArray(grant.accounts) ||
      !grant.accounts.length ||
      !grant.accounts.includes(grant.defaultAccount) ||
      !Array.isArray(grant.permissions) ||
      grant.permissions.some((p) => !mcpPermissions.includes(p)) ||
      grant.accounts.some((account) => !this.ports.accounts().some((entry) => entry.id === account))
    )
      throw new McpError("validation", "请选择有效账号、默认账号和权限");
    this.invalidate(id, "客户端权限已变化");
    Object.assign(client, structuredClone(grant), { approved: true });
    this.commit();
  }

  /** Revoke pending requests and interrupt transports on explicit disconnect or removal */
  disconnect(id: string): void {
    this.invalidate(id, "连接已断开");
    for (const close of this.connections.get(id) ?? []) close();
    this.connections.delete(id);
    this.commit();
  }
  /** Remove the grant and terminate the associated HTTP session */
  revoke(id: string): StoredClient | undefined {
    const client = this.data.clients.find((entry) => entry.id === id);
    this.disconnect(id);
    for (const [requestId, entry] of this.access)
      if (entry.request.clientId === id) {
        this.access.delete(requestId);
        for (const resolve of [...entry.waiters]) resolve("deny");
      }
    this.once.delete(id);
    this.data.clients = this.data.clients.filter((entry) => entry.id !== id);
    this.commit();
    return client;
  }
  /** Stop all clients and invalidate unexecuted approvals */
  disable(): void {
    this.data.enabled = false;
    for (const client of this.data.clients) this.disconnect(client.id);
    this.status = "off";
    this.commit();
  }
  /** Expiry or logout revokes pending approvals even if the account is logged in again later */
  accountsChanged(): void {
    const accounts = this.ports.accounts();
    for (const client of this.data.clients)
      if (client.accounts.some((id) => !accounts.some((account) => account.id === id && account.status !== "expired")))
        this.invalidate(client.id, "账号已退出、删除或登录过期");
    this.commit();
  }
  /** Store only directories chosen by the trusted host picker */
  directory(id: string, path: string | null, removeId?: string): void {
    const client = this.client(id);
    this.invalidate(id, "素材目录授权已变化");
    if (removeId) client.directories = client.directories.filter((entry) => entry.id !== removeId);
    else if (path) client.directories.push({ id: randomUUID(), name: basename(path), path });
    this.commit();
  }

  /** Resolve one client and ensure a pairing cannot be used as authorization */
  private client(id: string, approved = true): StoredClient {
    const client = this.data.clients.find((entry) => entry.id === id);
    if (!client || (approved && !client.approved))
      throw new McpError("pairing_required", "请在 Glaze 弹窗中批准此 AI 工具连接，或在侧边栏「AI 助手」里一键连接");
    return client;
  }
  /** Check account scope and plugin availability before every platform phase */
  private authorize(id: string, permission: string | null, account?: string): StoredClient {
    if (!this.data.enabled) throw new McpError("unavailable", "MCP 服务已关闭");
    const client = this.client(id);
    if (permission && !this.allowed(id, permission)) throw new McpError("forbidden", "此 AI 工具没有该权限");
    if (
      account &&
      (!client.accounts.includes(account) ||
        !this.ports.accounts().some((entry) => entry.id === account && entry.status !== "expired"))
    )
      throw new McpError("forbidden", "账号未授权、已退出或已过期");
    return client;
  }
  /** Invalidate work after scope changes, including async operations awaiting network responses */
  private invalidate(id: string, message: string): void {
    this.epochs.set(id, (this.epochs.get(id) ?? 0) + 1);
    for (const operation of this.data.operations)
      if (operation.clientId === id && operation.state === "pending") {
        operation.state = "expired";
        operation.message = message;
      }
  }
  /** Expose only granted tools; authentication alone exposes no business schema */
  tools(id: string) {
    const client = this.client(id, false);
    return client.approved
      ? this.definitions.filter(
          (tool) => tool.permission === null || client.permissions.includes(tool.permission as never),
        )
      : [];
  }

  /** Validate inputs, enforce rate limits and account isolation, then audit one tool invocation */
  async call(id: string, name: string, input: unknown): Promise<unknown> {
    let account: string | null = null;
    let outcome = "failed";
    if (name === "glaze_status") return this.describe(id);
    if (name === "glaze_request_access") return this.requestAccessTool(id, input);
    const tool = this.definitions.find((entry) => entry.name === name);
    if (!tool) throw new McpError("unknown_tool", "工具不存在");
    if (!this.client(id, false).approved) this.requestConnect(id);
    // Reject malformed calls before asking the user to approve anything
    const checked = tool.schema.safeParse(input ?? {});
    if (!checked.success)
      throw new McpError(
        "validation",
        checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      );
    await this.ensurePermission(id, tool);
    const recent = (this.rates.get(id) ?? []).filter((time) => time > Date.now() - 60_000);
    if (recent.length >= 60 || this.calls.has(id))
      throw new McpError("rate_limited", "请降低调用频率并等待当前调用完成");
    recent.push(Date.now());
    this.rates.set(id, recent);
    this.calls.add(id);
    try {
      const parsed = tool.schema.safeParse(input ?? {});
      if (!parsed.success)
        throw new McpError(
          "validation",
          parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
        );
      const params = parsed.data as Record<string, unknown>;
      const client = this.authorize(id, tool.permission);
      const epoch = this.epochs.get(id) ?? 0;
      const draft = typeof params.draftId === "string" ? this.draft(id, params.draftId) : undefined;
      const accountRequired = !name.startsWith("app_") || name === "app_switch_account";
      account = accountRequired
        ? (draft?.account ?? (typeof params.account === "string" ? params.account : client.defaultAccount))
        : null;
      if (accountRequired) this.authorize(id, tool.permission, account ?? undefined);
      const guard = () => {
        this.authorize(id, tool.permission, account ?? undefined);
        if ((this.epochs.get(id) ?? 0) !== epoch) throw new McpError("forbidden", "请求期间授权发生变化");
      };
      let result: unknown;
      if (tool.invoke) result = await this.business(client, tool.invoke, { ...params, account }, tool.readOnly, guard);
      else if (!params.draftId && !name.startsWith("works_draft_") && !tool.method.includes("."))
        result = await this.direct(client, name, { ...params, account }, guard);
      else if (tool.method.includes(".")) {
        this.ports.assertEnabled(tool.method);
        if (name === "account_list")
          result = this.ports
            .accounts()
            .filter((entry) => client.accounts.includes(entry.id))
            .map(({ id: accountId, nickname, passport, status }) => ({ id: accountId, nickname, passport, status }));
        else if (name === "account_current")
          result =
            this.ports
              .accounts()
              .filter((entry) => entry.id === client.defaultAccount)
              .map(({ id: accountId, nickname, passport, status }) => ({
                id: accountId,
                nickname,
                passport,
                status,
              }))[0] ?? null;
        else result = await this.ports.read(tool.method, { ...params, account });
      } else result = await this.editing(client, name, { ...params, account }, draft, guard);
      guard();
      outcome = result && typeof result === "object" && "state" in result ? String(result.state) : "succeeded";
      return publicValue(result);
    } catch (error) {
      outcome = error instanceof McpError ? error.kind : "failed";
      throw error;
    } finally {
      this.calls.delete(id);
      if (tool.permission) this.once.get(id)?.delete(tool.permission as McpPermission);
      this.audit(id, name, account, outcome);
    }
  }

  /** Append bounded metadata only; never log parameters, credentials or response bodies */
  private audit(id: string, tool: string, account: string | null, result: string): void {
    this.data.audit.unshift({
      id: randomUUID(),
      time: new Date().toISOString(),
      clientId: id,
      clientName: this.data.clients.find((entry) => entry.id === id)?.name ?? "已撤销客户端",
      tool,
      title: this.definitions.find((entry) => entry.name === tool)?.title ?? tool,
      account,
      result,
    });
    this.data.audit.length = Math.min(this.data.audit.length, 500);
    this.commit();
  }
  /** Bind uploaded assets to the same client, account, work and business purpose */
  private ownsAsset(snapshot: McpDraft, asset: StoredAsset): boolean {
    const source = this.data.drafts.find((entry) => entry.id === asset.draftId);
    return (
      !!source &&
      source.clientId === snapshot.clientId &&
      source.account === snapshot.account &&
      source.itemId === snapshot.itemId &&
      (source.purpose ?? "works") === (snapshot.purpose ?? "works")
    );
  }

  /** Drop completed editing snapshots while preserving material ownership and unresolved writes */
  private pruneSnapshots(): void {
    const retained = new Set(
      this.data.assets.filter((asset) => asset.expiresAt > Date.now()).map((asset) => asset.draftId),
    );
    for (const op of this.data.operations)
      if (
        ["pending", "running", "unknown", "created_id_unresolved", "platform_action"].includes(op.state) ||
        (op.state === "failed" && isWorkRecord(op.result) && op.result.saved === true)
      )
        retained.add(op.draftId);
    this.data.drafts = this.data.drafts.filter((snapshot) => retained.has(snapshot.id));
    const ids = new Set(this.data.drafts.map((snapshot) => snapshot.id));
    this.data.draftKeys = Object.fromEntries(Object.entries(this.data.draftKeys).filter(([, id]) => ids.has(id)));
    this.commit();
  }

  /** Read current fields, apply the requested patch and finish a write in a single MCP call */
  private async direct(
    client: StoredClient,
    name: string,
    params: Record<string, unknown>,
    guard: () => void,
  ): Promise<unknown> {
    const account = params.account as string;
    if (name === "materials_directories") return client.directories.map(({ id, name }) => ({ id, name }));
    if (["works_editor", "works_options", "works_operation_get"].includes(name))
      return this.editing(client, name, params, undefined, guard);
    const key = `direct:${client.id}:${account}:${name}:${params.idempotencyKey}`;
    const fingerprint = createHash("sha256").update(canonical({ name, params })).digest("hex");
    const previous = this.data.operations.find((op) => op.key === key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new McpError("conflict", "幂等键已用于其他内容");
      return this.operationView(previous);
    }
    const uploading = name === "works_upload" || name === "promotion_upload";
    if (name === "promotion_upload" && !["richImage", "banner", "video"].includes(String(params.kind)))
      throw new McpError("validation", "推广材料只支持 richImage、banner、video");
    const document = params.itemId
      ? await this.ports.editor(account, params.itemId as string)
      : {
          itemId: "",
          status: "init" as const,
          version: "0.1",
          modCode: "",
          guides: [],
          fields: emptyWorkCreateFields(),
        };
    guard();
    const snapshot: McpDraft = {
      id: randomUUID(),
      clientId: client.id,
      account,
      itemId: (params.itemId as string) ?? null,
      purpose: name === "promotion_upload" ? "promotion" : "works",
      document,
      revision: 1,
      patch: {},
      updatedAt: Date.now(),
      locked: false,
    };
    this.data.drafts.push(snapshot);
    try {
      const patch = name === "works_create" ? params.fields : params.patch;
      if (patch) {
        if (params.base) {
          const base = params.base as WorkRecord;
          if (
            !isWorkRecord(patch) ||
            Object.keys(base).some(
              (key) => !(key in patch) || canonical(base[key]) !== canonical(document.fields[key] ?? null),
            )
          )
            throw new McpError("conflict", "作品内容已变化，请重新读取后修改");
        }
        this.patchDraft(snapshot, 1, patch);
      }
      const result = await this.editing(
        client,
        uploading ? "works_asset_import" : name,
        {
          ...params,
          draftId: snapshot.id,
          revision: snapshot.revision,
          operationKey: key,
          operationFingerprint: fingerprint,
          directMethod: name,
        },
        snapshot,
        guard,
      );
      return result;
    } finally {
      this.pruneSnapshots();
    }
  }

  /** Execute a whitelisted host business method with durable deduplication and per-target locking */
  private async business(
    client: StoredClient,
    method: string,
    params: Record<string, unknown>,
    readOnly: boolean,
    guard: () => void,
  ): Promise<unknown> {
    this.ports.assertEnabled(method);
    if (!this.ports.invoke) throw new McpError("unavailable", "业务适配器未注册");
    const account = (params.account as string | null) ?? "";
    if (readOnly) return this.ports.invoke(method, params, guard, guard);
    const key = `business:${client.id}:${account}:${method}:${params.idempotencyKey}`;
    const fingerprint = createHash("sha256").update(canonical(params)).digest("hex");
    const prior = this.data.operations.find((op) => op.key === key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new McpError("conflict", "幂等键已用于其他内容");
      return this.operationView(prior);
    }
    const target = `${account}:${method.startsWith("works.") ? String(params.itemId) : method.split(".")[0]}`;
    if (
      this.writes.has(target) ||
      this.data.operations.some(
        (op) =>
          !op.resolvedAt &&
          (["unknown", "platform_action", "created_id_unresolved"].includes(op.state) ||
            (op.state === "failed" && isWorkRecord(op.result) && op.result.saved === true)) &&
          (op.target === target ||
            (method.startsWith("works.") && op.account === account && op.itemId === params.itemId)),
      )
    )
      throw new McpError("conflict", "目标存在执行中或结果待核实的操作");
    if (this.data.operations.length >= 5000) throw new McpError("limit", "操作记录达到上限，请先整理历史记录");
    const op: StoredOperation = {
      id: randomUUID(),
      clientId: client.id,
      clientName: client.name,
      account,
      draftId: "",
      revision: 1,
      action: "business",
      method,
      target,
      ...(typeof params.itemId === "string" ? { itemId: params.itemId } : {}),
      state: "running",
      phase: "validating",
      message: "正在执行",
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60_000,
      key,
      fingerprint,
    };
    this.data.operations.unshift(op);
    this.writes.add(target);
    let sent = false;
    try {
      this.commit();
      const check = () => {
        guard();
        this.ports.assertEnabled(method);
      };
      const beforeWrite = () => {
        check();
        op.phase = "writing";
        this.commit();
        sent = true;
      };
      const { idempotencyKey: _key, ...input } = params;
      // Upload receipts stay inside the host; public callers reference material IDs only
      if (method === "promotion.join" || method === "promotion.saveBanner") {
        const material = (id: unknown, kind: string) => {
          const asset = this.data.assets.find(
            (asset) => asset.id === id && asset.uploaded && asset.expiresAt > Date.now(),
          );
          const source = this.data.drafts.find((snapshot) => snapshot.id === asset?.draftId);
          if (
            !asset?.receipt ||
            source?.clientId !== client.id ||
            source.account !== account ||
            source.purpose !== "promotion" ||
            asset.kind !== kind
          )
            throw new McpError("forbidden", "推广材料未上传、类型不匹配或不属于此客户端账号");
          return asset.receipt;
        };
        if (method === "promotion.join") {
          input.images = (input.imageAssetIds as string[]).map((id) => material(id, "richImage").receipt);
          input.videos = (input.videoAssetIds as string[]).map((id) => material(id, "video").receipt);
          delete input.imageAssetIds;
          delete input.videoAssetIds;
        } else {
          input.imageUrl = material(input.imageAssetId, "banner").url;
          delete input.imageAssetId;
        }
      }
      op.result = await this.ports.invoke(method, input, check, beforeWrite);
      if (op.result && typeof op.result === "object" && "outcome" in op.result && op.result.outcome === "uncertain") {
        op.state = "unknown";
        op.message = "平台结果待核实，禁止自动重试";
      } else {
        op.state = "succeeded";
        op.phase = "completed";
        op.message = "操作已完成";
      }
    } catch (error) {
      const kind = error && typeof error === "object" && "kind" in error ? String(error.kind) : "internal";
      op.state = sent && ["network", "timeout", "parse", "internal"].includes(kind) ? "unknown" : "failed";
      op.message =
        op.state === "unknown"
          ? "平台写入结果待核实，禁止自动重试"
          : error instanceof Error
            ? error.message
            : "操作失败";
    } finally {
      this.writes.delete(target);
      this.commit();
    }
    return this.operationView(op);
  }

  /** Look up drafts with owner binding before revealing any fields */
  private draft(id: string, draftId: string): McpDraft {
    const draft = this.data.drafts.find((entry) => entry.id === draftId && entry.clientId === id);
    if (!draft) throw new McpError("not_found", "草稿不存在或不属于此客户端");
    return draft;
  }
  /** Enforce optimistic revision checks before local and remote changes */
  private revision(draft: McpDraft, revision: unknown): void {
    if (draft.locked) throw new McpError("conflict", "草稿正在执行或结果待核实，不能重复修改或提交");
    if (draft.revision !== revision) throw new McpError("conflict", "草稿版本已变化，请重新读取预览");
  }
  /** Only host-generated material references may introduce new media */
  private resolvePatch(draft: McpDraft, patch: WorkRecord): WorkRecord {
    const original = canonical(draft.document.fields);
    const assets = this.data.assets.filter(
      (asset) => this.ownsAsset(draft, asset) && asset.receipt && asset.expiresAt > Date.now(),
    );
    const allowedUrl = (url: string) =>
      !url || original.includes(JSON.stringify(url)) || assets.some((asset) => asset.receipt?.url === url);
    const resolve = (value: WorkValue, key: string): WorkValue => {
      if (Array.isArray(value)) return value.map((entry) => resolve(entry, key));
      if (isWorkRecord(value)) {
        if ("$asset" in value) {
          if (Object.keys(value).some((field) => !["$asset", "as"].includes(field)))
            throw new McpError("validation", "材料引用不能附带额外字段");
          const asset = assets.find((entry) => entry.id === value.$asset);
          if (!asset?.receipt) throw new McpError("validation", "材料尚未上传、已过期或不属于此草稿");
          const kind = value.as;
          if (kind === "receipt") return { ...asset.receipt.receipt };
          if (kind === "url") return asset.receipt.url;
          if (kind === "name") return asset.name;
          if (kind === "size") return asset.size;
          throw new McpError("validation", "材料引用类型无效");
        }
        if (Object.keys(value).some((field) => ["body", "sign", "file_type"].includes(field))) {
          if (
            assets.some((asset) => canonical(asset.receipt?.receipt) === canonical(value)) ||
            original.includes(canonical(value))
          )
            return value;
          throw new McpError("forbidden", "不能提交上传签名或回执");
        }
        return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, resolve(entry, field)]));
      }
      if (typeof value === "string" && key === "info") {
        return sanitizeHtml(value, {
          allowedTags: [
            "p",
            "br",
            "strong",
            "b",
            "em",
            "i",
            "u",
            "s",
            "ul",
            "ol",
            "li",
            "h1",
            "h2",
            "h3",
            "blockquote",
            "img",
          ],
          allowedAttributes: { img: ["src", "alt"] },
          transformTags: {
            img: (_tag, attrs) => {
              let src = attrs.src ?? "";
              if (src.startsWith("glaze-asset:"))
                src = assets.find((asset) => asset.id === src.slice(12))?.receipt?.url ?? "";
              if (!allowedUrl(src)) throw new McpError("forbidden", "详情图片必须来自本作品或已上传材料");
              return { tagName: "img", attribs: { src, alt: attrs.alt ?? "" } };
            },
          },
          allowedSchemes: ["https"],
          allowProtocolRelative: false,
        });
      }
      if (typeof value === "string" && mediaKeys.has(key) && !allowedUrl(value))
        throw new McpError("forbidden", "媒体必须来自本作品或已上传材料");
      return value;
    };
    return resolve(patch, "") as WorkRecord;
  }

  /** Compare signed upload references with the equivalent platform URL after a successful save */
  private reviewFields(draft: McpDraft, fields: WorkRecord): WorkRecord {
    const assets = this.data.assets.filter((asset) => this.ownsAsset(draft, asset) && asset.receipt);
    const normalize = (value: WorkValue): WorkValue => {
      if (Array.isArray(value)) return value.map(normalize);
      if (isWorkRecord(value)) {
        const asset = assets.find((entry) => canonical(entry.receipt?.receipt) === canonical(value));
        if (asset?.receipt) return asset.receipt.url;
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
      }
      return value;
    };
    return normalize(fields) as WorkRecord;
  }
  /** Patch explicit fields only, invalidating every approval for the previous revision */
  patchDraft(draft: McpDraft, revision: number, patch: unknown, section?: string): McpDraft {
    this.revision(draft, revision);
    if (!isWorkRecord(patch) || !isWorkValue(patch) || !Object.keys(patch).length)
      throw new McpError("validation", "草稿字段无效");
    const allowed = section ? workSections[section as keyof typeof workSections] : Object.values(workSections).flat();
    if (!allowed || Object.keys(patch).some((key) => !(allowed as readonly string[]).includes(key)))
      throw new McpError("validation", "字段不属于指定分区");
    // Validate references now, while retaining opaque references until execution
    const candidate = { ...draft.patch, ...structuredClone(patch) };
    if (isWorkRecord(candidate.sync_item_info)) {
      const originalPc = isWorkRecord(draft.document.fields.sync_item_info) ? draft.document.fields.sync_item_info : {};
      const editablePc = new Set([
        "item_name",
        "brief",
        "info",
        "pri_type",
        "sub_type",
        "include_map",
        "tag",
        "available_scope",
        "requirement",
        "channel",
        "weak_offline",
        "weak_offline_reason",
      ]);
      for (const [key, value] of Object.entries(candidate.sync_item_info))
        if (!editablePc.has(key) && canonical(value) !== canonical(originalPc[key]))
          throw new McpError("forbidden", `PC 字段 ${key} 只读`);
      candidate.sync_item_info = { ...originalPc, ...candidate.sync_item_info };
    }
    if (Buffer.byteLength(JSON.stringify(candidate)) > 3 * 1024 * 1024)
      throw new McpError("limit", "草稿修改总量超过 3MB，请拆分作品内容");
    this.resolvePatch(draft, candidate);
    draft.patch = candidate;
    draft.revision++;
    draft.updatedAt = Date.now();
    for (const operation of this.data.operations)
      if (operation.draftId === draft.id && operation.state === "pending") {
        operation.state = "expired";
        operation.message = "草稿已修改，原请求失效";
      }
    this.commit();
    return structuredClone(draft);
  }
  /** UI edits use the same validation but never grant the AI authority to approve */
  editDraft(draftId: string, revision: number, patch: WorkRecord): McpDraft {
    const draft = this.data.drafts.find((entry) => entry.id === draftId);
    if (!draft) throw new McpError("not_found", "草稿不存在");
    this.authorize(draft.clientId, "works:draft", draft.account);
    return this.patchDraft(draft, revision, patch);
  }

  /** Record explicit human reconciliation without making the original request replayable */
  resolveOperation(id: string): void {
    const operation = this.data.operations.find((entry) => entry.id === id);
    if (!operation || !["unknown", "created_id_unresolved", "platform_action", "failed"].includes(operation.state))
      throw new McpError("validation", "此操作不需要核对");
    operation.resolvedAt = Date.now();
    operation.message = "用户已核对平台结果；旧请求与草稿不能重试，请基于平台最新内容建立新草稿";
    this.commit();
    this.audit(operation.clientId, "human_reconciliation", operation.account, operation.state);
  }

  /** Route draft tools and execute platform operations within the client grant */
  private async editing(
    client: StoredClient,
    name: string,
    params: Record<string, unknown>,
    draft: McpDraft | undefined,
    guard: () => void,
  ): Promise<unknown> {
    const account = params.account as string;
    if (name === "works_operation_get") {
      const operation = this.data.operations.find(
        (entry) => entry.id === params.operationId && entry.clientId === client.id,
      );
      if (!operation) throw new McpError("not_found", "操作不存在");
      this.authorize(client.id, null, operation.account);
      this.expire();
      return this.operationView(operation);
    }
    this.ports.assertEnabled(
      draft?.purpose === "promotion" ? "promotion.upload" : name.startsWith("works_") ? "works.save" : name,
    );
    if (name === "works_editor") return this.ports.editor(account, params.itemId as string);
    if (name === "works_options") return this.ports.options(account);
    if (name === "works_draft_create") {
      const key = `${client.id}:${account}:${params.idempotencyKey}`;
      const previous = this.data.draftKeys[key];
      if (previous) {
        const existing = this.draft(client.id, previous);
        if (existing.itemId !== (params.itemId ?? null)) throw new McpError("conflict", "幂等键已用于其他作品");
        return existing;
      }
      if (this.data.drafts.length >= 500) throw new McpError("limit", "本地草稿数量已达上限");
      const document = params.itemId
        ? await this.ports.editor(account, params.itemId as string)
        : {
            itemId: "",
            status: "init" as const,
            version: "0.1",
            modCode: "",
            fields: emptyWorkCreateFields(),
            guides: [],
          };
      guard();
      const created: McpDraft = {
        id: randomUUID(),
        clientId: client.id,
        account,
        itemId: (params.itemId as string) ?? null,
        document,
        patch: {},
        revision: 1,
        updatedAt: Date.now(),
        locked: false,
      };
      this.data.drafts.push(created);
      this.data.draftKeys[key] = created.id;
      this.commit();
      return created;
    }
    if (!draft) throw new McpError("not_found", "缺少草稿");
    if (name === "works_draft_patch")
      return this.patchDraft(draft, params.revision as number, params.patch, params.section as string);
    if (name === "works_draft_preview")
      return {
        draft,
        changes: Object.entries(draft.patch).map(([field, after]) => ({
          field,
          before: draft.document.fields[field] ?? null,
          after,
        })),
        assets: this.data.assets
          .filter((asset) => asset.draftId === draft.id)
          .map(({ receipt: _receipt, path: _path, ...asset }) => asset),
        directories: client.directories.map(({ id, name }) => ({ id, name })),
      };
    if (name === "works_draft_validate") return { revision: draft.revision, issues: await this.validate(draft) };
    const actions: Record<string, McpAction> = {
      works_asset_import: "import",
      works_asset_upload: "upload",
      works_create: "create",
      works_save: params.submitReview ? "save_review" : "save",
      works_submit_review: "review",
    };
    const action = actions[name];
    if (!action) throw new McpError("unknown_tool", "工具不存在");
    const key = (params.operationKey as string | undefined) ?? `${client.id}:${account}:${params.idempotencyKey}`;
    const fingerprint =
      (params.operationFingerprint as string | undefined) ??
      createHash("sha256").update(canonical({ name, params })).digest("hex");
    const existing = this.data.operations.find((operation) => operation.key === key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new McpError("conflict", "幂等键不能用于不同操作");
      return this.operationView(existing);
    }
    this.revision(draft, params.revision);
    this.checkAction(client.id, draft, action);
    if (!["import", "upload"].includes(action)) {
      const issues = await this.validate(draft);
      guard();
      this.revision(draft, params.revision);
      if (issues.length)
        throw new McpError("validation", issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "));
    }
    if (action === "upload") this.asset(draft, params.assetId as string);
    if (this.data.operations.length >= 5000) throw new McpError("limit", "操作记录达到上限，请先整理历史记录");
    const operation: StoredOperation = {
      id: randomUUID(),
      clientId: client.id,
      clientName: client.name,
      account,
      draftId: draft.id,
      revision: draft.revision,
      action,
      ...(params.directMethod
        ? { method: String(params.directMethod), ...(draft.itemId ? { itemId: draft.itemId } : {}) }
        : {}),
      state: "pending",
      phase: "queued",
      message: "准备执行",
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60_000,
      key,
      fingerprint,
    };
    if (action === "upload") operation.assetId = params.assetId as string;
    if (action === "import") {
      operation.assetParams = {
        kind: params.kind as StoredAsset["kind"],
        platform: params.platform as "pe" | "pc",
        ...(params.channelId === undefined ? {} : { channelId: params.channelId as number }),
        ...(params.resourceType === undefined ? {} : { resourceType: params.resourceType as number }),
      };
      if (params.directoryId || params.relativePath) {
        if (!params.directoryId || !params.relativePath)
          throw new McpError("validation", "目录 ID 与相对路径必须同时提供");
        operation.directoryId = params.directoryId as string;
        operation.relativePath = params.relativePath as string;
      }
    }
    this.data.operations.unshift(operation);
    this.commit();
    try {
      await this.execute(operation);
    } catch (error) {
      // A failed preflight must not leave a request waiting for an approval that no longer exists
      if (operation.state === "pending") {
        operation.state = "failed";
        operation.phase = "preflight_failed";
        operation.message = error instanceof McpError ? error.message : "操作无法开始";
        this.commit();
      }
      throw error;
    }
    return this.operationView(operation);
  }

  /** Validate ownership and expiry for a material tied to one exact draft */
  private asset(draft: McpDraft, id: string): StoredAsset {
    const asset = this.data.assets.find(
      (entry) => entry.id === id && entry.draftId === draft.id && entry.expiresAt > Date.now(),
    );
    if (!asset) throw new McpError("not_found", "材料不存在、已过期或不属于此草稿");
    return asset;
  }
  /** Validate full business rules using shared platform adapters */
  private async validate(draft: McpDraft) {
    if (!editStates.has(draft.document.status)) return [{ field: "status", message: "作品当前状态不允许编辑" }];
    return this.ports.validate(draft, this.resolvePatch(draft, draft.patch));
  }
  /** Check distinct permissions for drafts, uploads, saves and review */
  private checkAction(id: string, draft: McpDraft, action: McpAction): void {
    this.authorize(
      id,
      draft.purpose === "promotion"
        ? "netease:promotion.write"
        : ["import", "upload"].includes(action)
          ? "works:upload"
          : action === "review"
            ? "works:review"
            : "works:save",
      draft.account,
    );
    if (action === "save_review") this.authorize(id, "works:review", draft.account);
    const unresolved = this.data.operations.some((operation) => {
      if (
        operation.resolvedAt ||
        operation.account !== draft.account ||
        !(
          ["unknown", "platform_action", "created_id_unresolved"].includes(operation.state) ||
          (operation.state === "failed" && isWorkRecord(operation.result) && operation.result.saved === true)
        )
      )
        return false;
      const previous = this.data.drafts.find((entry) => entry.id === operation.draftId);
      return draft.itemId ? (operation.itemId ?? previous?.itemId) === draft.itemId : previous?.itemId === null;
    });
    if (unresolved) throw new McpError("conflict", "此账号作品存在待核实的写入，请先在应用内核对平台结果");
    if (action === "create" && draft.itemId) throw new McpError("validation", "已有作品不能再次创建");
    if (["save", "save_review", "review"].includes(action) && !draft.itemId)
      throw new McpError("validation", "先创建作品并核实准确 ID");
    if (action === "review" && Object.keys(draft.patch).length)
      throw new McpError("validation", "草稿有修改，请使用保存并提审");
  }
  /** Hide idempotency keys and local import paths in operation results */
  private operationView({
    key: _key,
    fingerprint: _fingerprint,
    assetParams: _params,
    directoryId: _directory,
    relativePath: _relative,
    target: _target,
    ...operation
  }: StoredOperation): McpOperation {
    if (operation.method) {
      const { draftId: _snapshot, revision: _revision, ...result } = operation;
      const title = this.definitions.find(
        (tool) => tool.invoke === operation.method || tool.name === operation.method,
      )?.title;
      return structuredClone({ ...result, ...(title ? { title } : {}) });
    }
    return structuredClone(operation);
  }

  /** Execute under the granted capability; persist phases before each external action */
  private async execute(operation: StoredOperation): Promise<void> {
    const revision = operation.revision;
    const draft = this.draft(operation.clientId, operation.draftId);
    this.revision(draft, revision);
    this.checkAction(operation.clientId, draft, operation.action);
    const lockKey = `${draft.account}:${draft.itemId ?? draft.id}`;
    if (this.writes.has(lockKey)) throw new McpError("conflict", "此作品已有执行中的操作");
    if (
      operation.action === "import" &&
      (this.importing ||
        this.data.assets.length >= 200 ||
        this.data.assets.reduce((total, asset) => total + asset.size, 0) > 6 * 1024 * 1024 * 1024)
    )
      throw new McpError("limit", "材料导入正在进行或快照空间达到上限，请稍后重试");
    if (operation.action === "import") this.importing = true;
    this.writes.add(lockKey);
    draft.locked = true;
    const epoch = this.epochs.get(operation.clientId) ?? 0;
    const guard = () => {
      this.checkAction(operation.clientId, draft, operation.action);
      this.ports.assertEnabled(draft.purpose === "promotion" ? "promotion.upload" : "works.save");
      if (epoch !== (this.epochs.get(operation.clientId) ?? 0) || draft.revision !== revision)
        throw new McpError("conflict", "授权或内容已变化，执行已停止");
    };
    let externalSent = false;
    const beforeWrite = () => {
      guard();
      externalSent = true;
    };
    let saved = false;
    try {
      operation.state = "running";
      operation.phase = "validating";
      operation.message = "正在复核请求";
      this.commit();
      guard();
      if (operation.action === "import") {
        const client = this.client(operation.clientId);
        const directory = client.directories.find((entry) => entry.id === operation.directoryId);
        if (operation.directoryId && !directory) throw new McpError("forbidden", "素材目录未授权");
        const source = directory
          ? await resolveMaterial(directory.path, operation.relativePath ?? "")
          : await this.ports.pickFile();
        guard();
        if (!source) {
          operation.state = "rejected";
          operation.message = "已取消文件选择";
          return;
        }
        if (!operation.assetParams) throw new McpError("validation", "材料用途缺失");
        const asset = await snapshotMaterial(this.ports.assetRoot, source, {
          draftId: draft.id,
          ...operation.assetParams,
        });
        guard();
        this.data.assets.push(asset);
        operation.assetId = asset.id;
        operation.result = { assetId: asset.id, name: asset.name, size: asset.size, hash: asset.hash };
        if (operation.method === "works_upload" || operation.method === "promotion_upload") {
          await verifyMaterial(asset);
          guard();
          operation.phase = "uploading";
          this.commit();
          asset.receipt = await this.ports.upload(draft, asset, beforeWrite);
          asset.uploaded = true;
          operation.result = { ...(operation.result as object), uploaded: true };
        }
      } else if (operation.action === "upload") {
        if (!operation.assetId) throw new McpError("validation", "材料 ID 缺失");
        const asset = this.asset(draft, operation.assetId);
        if (!asset.receipt) {
          await verifyMaterial(asset);
          guard();
          operation.phase = "uploading";
          this.commit();
          asset.receipt = await this.ports.upload(draft, asset, beforeWrite);
          asset.uploaded = true;
          this.commit();
        }
        operation.result = { assetId: asset.id, uploaded: true };
      } else {
        const patch = this.resolvePatch(draft, draft.patch);
        const issues = await this.validate(draft);
        guard();
        if (issues.length)
          throw new McpError("validation", issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "));
        let expected = { ...draft.document.fields, ...patch };
        if (draft.itemId) {
          const current = await this.ports.editor(draft.account, draft.itemId);
          guard();
          const keys =
            operation.action === "review" || operation.action === "save_review"
              ? Object.keys(draft.document.fields)
              : Object.keys(patch);
          const conflicts = keys.filter(
            (key) => canonical(current.fields[key] ?? null) !== canonical(draft.document.fields[key] ?? null),
          );
          if (conflicts.length) throw new McpError("conflict", `平台内容已变化: ${conflicts.join(", ")}`);
          if (current.status !== draft.document.status)
            throw new McpError("conflict", "作品状态已变化，请重新创建草稿");
          expected = { ...current.fields, ...patch };
        }
        if (operation.action === "create") {
          operation.phase = "creating";
          this.commit();
          guard();
          await this.ports.createWork(draft, expected, beforeWrite);
          operation.state = "created_id_unresolved";
          operation.message = "已创建；平台未返回可靠 ID，请在作品列表确认，后续配置与提审需重新建立草稿";
          return;
        }
        if (operation.action !== "review" && Object.keys(patch).length) {
          operation.phase = "saving";
          this.commit();
          guard();
          await this.ports.saveWork(draft, patch, beforeWrite);
          saved = true;
          externalSent = false;
          operation.phase = "saved";
          operation.result = { saved: true };
          this.commit();
        }
        if (operation.action === "review" || operation.action === "save_review") {
          if (!draft.itemId) throw new McpError("validation", "作品 ID 尚未确认");
          const current = await this.ports.editor(draft.account, draft.itemId);
          guard();
          const approvedFields = this.reviewFields(draft, expected);
          if (canonical(this.reviewFields(draft, current.fields)) !== canonical(approvedFields))
            throw new McpError("conflict", "保存后平台内容与批准内容不一致，已停止提审，请重新检查");
          operation.phase = "submitting_review";
          this.commit();
          guard();
          const result = await this.ports.review(draft.account, draft.itemId, approvedFields, beforeWrite);
          expected = current.fields;
          externalSent = false;
          operation.result = { saved, review: result };
          if (result.needCheckApply) {
            operation.state = "platform_action";
            operation.message = "平台要求额外审核确认，请在官方平台处理";
            return;
          }
        }
        if (saved) {
          draft.document.fields = expected;
          draft.patch = {};
          draft.revision++;
        }
      }
      operation.state = "succeeded";
      operation.phase = "completed";
      operation.message = "操作已完成";
    } catch (error) {
      const kind = error && typeof error === "object" && "kind" in error ? String(error.kind) : "internal";
      const uncertain =
        externalSent &&
        (["internal", "network", "timeout", "parse"].includes(kind) ||
          (error instanceof Error && /数据格式无法识别|响应无法确认/.test(error.message)));
      operation.state = uncertain ? "unknown" : "failed";
      operation.message = `${saved ? "保存已成功；后续步骤失败。" : ""}${uncertain ? "平台写入结果待核实，禁止自动重试" : error instanceof Error ? error.message : "操作失败"}`;
    } finally {
      draft.locked =
        ["unknown", "created_id_unresolved", "platform_action"].includes(operation.state) ||
        (saved && operation.state !== "succeeded");
      this.writes.delete(lockKey);
      if (operation.action === "import") this.importing = false;
      this.commit();
      this.audit(operation.clientId, operation.action, operation.account, operation.state);
    }
  }
}
