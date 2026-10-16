import { capabilities, type RpcMethod, workSections } from "@glaze/contracts";
import { z } from "zod";
import { appTools } from "./app-tools";
import { businessTools } from "./business-tools";
import { directTools } from "./direct-tools";
import type { PluginToolTarget } from "./model";

const id = z.string().min(1).max(128);
const itemId = z.string().regex(/^\d{1,32}$/);
const account = { account: id.optional() };
const platform = z.enum(["pe", "pc"]);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const rank = {
  ...account,
  board: z.enum(["pe_hot", "hot_search", "pe_download", "pe_sell"]),
  category: z.enum(["mod", "map", "texture", "lobby"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
};
const work = { ...account, itemId };
const draft = { draftId: id };
const revision = { ...draft, revision: z.number().int().positive() };
const request = { ...revision, idempotencyKey: id };
export const assetShape = {
  kind: z.enum(["resource", "image", "banner", "video", "videoCover", "richImage", "proof"]),
  platform: platform.default("pe"),
  channelId: z.number().int().min(0).max(10000).optional(),
  resourceType: z.number().int().min(1).max(10000).optional(),
};

export const readSchemas: Partial<Record<RpcMethod, z.ZodObject>> = {
  "account.list": z.strictObject({}),
  "account.current": z.strictObject({}),
  "app.getAbout": z.strictObject({}),
  "app.getLicenses": z.strictObject({}),
  "update.state": z.strictObject({}),
  "update.check": z.strictObject({}),
  "developer.level": z.strictObject(account),
  "analytics.overview": z.strictObject(account),
  "analytics.daily": z.strictObject({
    ...account,
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    platform: platform.optional(),
    resourceIds: z.array(itemId).max(500),
    includePeers: z.boolean().optional(),
  }),
  "income.list": z.strictObject({ ...account, platform, month: month.optional() }),
  "income.detail": z.strictObject({ ...account, id }),
  "income.estimate": z.strictObject({ ...account, month: month.optional() }),
  "rank.list": z.strictObject(rank),
  "rank.page": z.strictObject({
    ...rank,
    start: z.number().int().min(0).max(1_000_000).optional(),
    includeIcons: z.boolean().optional(),
  }),
  "rank.icons": z.strictObject({ ...account, itemIds: z.array(itemId).max(50) }),
  "works.list": z.strictObject({ ...account, platform: platform.optional() }),
  "works.get": z.strictObject(work),
  "works.reviewFeedback": z.strictObject(work),
  "promotion.activities": z.strictObject({ ...account, page: z.number().int().min(0).max(10000).optional() }),
  "promotion.discount": z.strictObject(account),
  "promotion.dates": z.strictObject(account),
  "promotion.applications": z.strictObject({ ...account, page: z.number().int().min(0).max(10000).optional() }),
  "promotion.module": z.strictObject({
    ...account,
    kind: z.enum(["review", "discount"]),
    activityId: id,
    moduleId: id,
  }),
};

export interface ToolDefinition {
  name: string;
  method: string;
  title: string;
  description: string;
  permission: string | null;
  schema: z.ZodObject;
  readOnly: boolean;
  invoke?: string;
  plugin?: PluginToolTarget;
}

/** Derive public tools only from explicitly exposed, non-credential capabilities */
export function legacyToolDefinitions(): ToolDefinition[] {
  const read = Object.entries(readSchemas).map(([method, schema]) => {
    const meta = capabilities[method as RpcMethod];
    if (
      !schema ||
      !meta?.mcp ||
      meta.caller !== "any" ||
      meta.risk !== "read" ||
      meta.permission === "netease:account.manage"
    )
      throw new Error(`Unsafe MCP mapping: ${method}`);
    return {
      name: method.replaceAll(".", "_"),
      method,
      title: meta.mcp.title,
      description: `${meta.mcp.description} account 未传时固定使用本客户端获准的默认账号，不跟随界面切换。`,
      permission: meta.permission,
      schema,
      readOnly: true,
    };
  });
  return [...read, ...editingTools];
}

/** Publish the direct API; legacy snapshot helpers are never listed or callable by MCP clients */
export function toolDefinitions(): ToolDefinition[] {
  return [
    ...legacyToolDefinitions().filter((tool) => tool.method.includes(".")),
    ...directTools,
    ...businessTools,
    ...appTools,
  ];
}

/** Declare editing schemas separately from shell-only platform write endpoints */
function edit(
  name: string,
  title: string,
  permission: string,
  schema: z.ZodObject,
  description: string,
  readOnly = false,
): ToolDefinition {
  return { name, method: name, title, permission, schema, description, readOnly };
}
const editingTools = [
  edit(
    "works_editor",
    "读取可编辑文档",
    "netease:works.read",
    z.strictObject(work),
    "返回作品编辑字段、状态与版本，不返回签名或凭据。",
    true,
  ),
  edit(
    "works_options",
    "读取编辑选项",
    "netease:works.read",
    z.strictObject(account),
    "获取实时类别、定价、图片尺寸等约束。",
    true,
  ),
  edit(
    "works_draft_create",
    "创建本地 AI 草稿",
    "works:draft",
    z.strictObject({ ...account, itemId: itemId.optional(), idempotencyKey: id }),
    "创建隔离草稿；省略 itemId 表示新作品。重试必须复用 idempotencyKey。不会写入网易。",
  ),
  edit(
    "works_draft_patch",
    "修改草稿分区",
    "works:draft",
    z.strictObject({
      ...revision,
      section: z.enum(Object.keys(workSections) as [string, ...string[]]),
      patch: z.record(z.string(), z.unknown()),
    }),
    "仅修改指定分区字段。revision 必须匹配，成功后加一。材料引用格式 {$asset:材料ID,as:'receipt'|'url'|'name'|'size'}；禁止伪造回执和新增未授权媒体 URL。富文本图片 src 使用 glaze-asset:材料ID。",
  ),
  edit(
    "works_draft_validate",
    "校验草稿",
    "works:draft",
    z.strictObject(draft),
    "返回字段问题和当前 revision，校验失败不写入平台。",
    true,
  ),
  edit(
    "works_draft_preview",
    "预览作品变更",
    "works:draft",
    z.strictObject(draft),
    "返回分区差异和材料清单；可在应用 AI 接入页查看并继续编辑。",
    true,
  ),
  edit(
    "works_asset_import",
    "导入草稿材料",
    "works:upload",
    z.strictObject({
      ...request,
      ...assetShape,
      directoryId: id.optional(),
      relativePath: z.string().min(1).max(1024).optional(),
    }),
    "未指定授权目录时直接打开文件选择器。指定 directoryId 与 relativePath 时从已授权目录创建不可变快照。返回操作 ID，通过 works_operation_get 查询材料 ID；不会上传。",
  ),
  edit(
    "works_asset_upload",
    "上传材料",
    "works:upload",
    z.strictObject({ ...request, assetId: id }),
    "在上传权限范围内直接上传固定材料，无需二次确认。返回执行结果和操作 ID，不返回签名回执。",
  ),
  edit(
    "works_create",
    "创建作品",
    "works:save",
    z.strictObject(request),
    "获得保存权限后直接创建平台作品，无需二次确认。平台未返回作品 ID 时返回 created_id_unresolved，禁止猜测 ID 或自动提审。",
  ),
  edit(
    "works_save",
    "保存作品",
    "works:save",
    z.strictObject({ ...request, submitReview: z.boolean().default(false) }),
    "获得保存权限后直接保存现有作品，无需二次确认，返回执行状态和操作 ID。submitReview 默认 false；仅明确要求保存并提审时设为 true，额外需要提审权限。检查 state，只有 succeeded 表示全部完成；unknown 禁止自动重试。",
  ),
  edit(
    "works_submit_review",
    "提交审核",
    "works:review",
    z.strictObject(request),
    "获得提审权限后直接提交未修改的已存在作品草稿，绑定内容快照，无需二次确认。",
  ),
  edit(
    "works_operation_get",
    "查询操作结果",
    "works:draft",
    z.strictObject({ operationId: id }),
    "查询本客户端操作状态，包括待确认、保存成功但提审失败、结果未知、平台要求额外处理。不要自动重试结果未知的写入。",
    true,
  ),
];
