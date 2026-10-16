import { z } from "zod";
import type { ToolDefinition } from "./tools";

const id = z.string().min(1).max(128);
const itemId = z.string().regex(/^\d{1,32}$/);
const account = { account: id.optional() };
const key = { idempotencyKey: id };
const fields = z.record(z.string(), z.unknown());
const material = {
  kind: z.enum(["resource", "image", "banner", "video", "videoCover", "richImage", "proof"]),
  platform: z.enum(["pe", "pc"]).default("pe"),
  channelId: z.number().int().min(0).max(10000).optional(),
  resourceType: z.number().int().min(1).max(10000).optional(),
  filePath: z.string().min(1).max(4096).optional(),
  interactive: z.boolean().optional(),
  directoryId: id.optional(),
  relativePath: z.string().min(1).max(1024).optional(),
};

/** Describe direct business calls without exposing internal write snapshots */
function tool(
  name: string,
  title: string,
  permission: string | null,
  shape: z.ZodRawShape,
  description: string,
  readOnly = false,
): ToolDefinition {
  let schema = z.strictObject(shape);
  if (name === "works_upload" || name === "promotion_upload")
    schema = schema.superRefine((params, ctx) => {
      const directory = params.directoryId !== undefined || params.relativePath !== undefined;
      if (directory && (!params.directoryId || !params.relativePath))
        ctx.addIssue({ code: "custom", message: "directoryId 与 relativePath 必须同时提供" });
      if (Number(params.filePath !== undefined) + Number(directory) + Number(params.interactive === true) !== 1)
        ctx.addIssue({
          code: "custom",
          message: "请选择一种素材来源: filePath、directoryId + relativePath 或 interactive: true",
        });
    });
  return { name, method: name, title, permission, schema, description, readOnly };
}

export const directTools = [
  tool(
    "works_editor",
    "读取作品全部编辑字段",
    "netease:works.read",
    { ...account, itemId },
    "读取当前作品全部可编辑字段、状态与版本。修改时只传需要修改的字段；无需建立草稿。",
    true,
  ),
  tool(
    "works_options",
    "读取作品编辑选项",
    "netease:works.read",
    account,
    "读取实时类别、定价、图片尺寸等约束。",
    true,
  ),
  tool(
    "works_save",
    "直接修改并保存作品",
    "works:save",
    { ...account, itemId, patch: fields, base: fields.optional(), submitReview: z.boolean().default(false), ...key },
    "直接按 itemId 和 patch 保存作品。patch 支持编辑器全部可写分区字段，如 item_name、info、price、res、channel、sync_item_info。可提供 base（所改字段的原值）防止覆盖其他修改。无需草稿和二次确认。普通保存不提审；submitReview=true 需独立提审权限。新媒体使用 works_upload 返回的 {$asset:id,as:'receipt'|'url'|'name'|'size'}。重试复用 idempotencyKey，unknown 不得自动重试。",
  ),
  tool(
    "works_create",
    "直接创建作品",
    "works:save",
    { ...account, fields, ...key },
    "直接提交完整新作品字段，无需草稿。先读取 works_options。上传新作品材料时省略 itemId，再在 fields 引用材料 ID。平台未返回准确 ID 时返回 created_id_unresolved，不猜测作品 ID。",
  ),
  tool(
    "works_submit_review",
    "直接提交作品审核",
    "works:review",
    { ...account, itemId, ...key },
    "按 itemId 读取当前内容并直接提审，保留状态与内容复核。",
  ),
  tool(
    "works_upload",
    "上传作品材料",
    "works:upload",
    { ...account, itemId: itemId.optional(), ...material, ...key },
    "后台上传作品材料并返回 assetId。优先传 filePath（运行 Glaze 的电脑上、用户明确指定的素材文件绝对路径），或 directoryId + relativePath 从已授权目录读取；仅 interactive=true 才打开文件选择器，缺少来源直接报错。不得自行扫描或上传无关文件。已有作品提供 itemId；新作品省略。材料绑定客户端、账号和作品，不返回本机路径或上传签名。",
  ),
  tool(
    "works_operation_get",
    "查询操作结果",
    null,
    { operationId: id },
    "读取本客户端操作结果，unknown 表示结果待核实，不能盲目重试。",
    true,
  ),
  tool(
    "materials_directories",
    "查看已授权素材目录",
    null,
    account,
    "返回目录 ID 与名称，供作品或推广材料上传使用，不返回本机路径。",
    true,
  ),
  tool(
    "promotion_upload",
    "上传推广材料",
    "netease:promotion.write",
    { ...account, ...material, ...key },
    "后台上传推广图片或视频，返回可用于 promotion_join 或 promotion_saveBanner 的 assetId。kind 仅支持 richImage、banner、video。优先传用户明确指定的本机素材绝对路径 filePath，或 directoryId + relativePath；仅 interactive=true 打开文件选择器，缺少来源直接报错。不得自行扫描或上传无关文件。",
  ),
];
