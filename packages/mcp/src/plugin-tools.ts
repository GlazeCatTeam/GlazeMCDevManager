import {
  type PluginManifest,
  type PluginToolContribution,
  type PluginToolField,
  pluginToolName,
} from "@glaze/contracts";
import { z } from "zod";
import type { ToolDefinition } from "./tools";

/** Convert a manifest field into a strict, bounded public input schema */
function fieldSchema(field: PluginToolField): z.ZodType {
  for (const key of ["minimum", "maximum", "maxLength", "maxItems"] as const) {
    const value = field[key];
    if (
      value !== undefined &&
      (!Number.isFinite(value) ||
        ((key === "maxLength" || key === "maxItems") && (!Number.isInteger(value) || value < 0)))
    )
      throw new Error(`参数约束 ${key} 无效`);
  }
  if (field.minimum !== undefined && field.maximum !== undefined && field.minimum > field.maximum)
    throw new Error("参数范围无效");
  let schema: z.ZodType;
  switch (field.type) {
    case "string": {
      let value = z.string();
      if (field.maxLength !== undefined) value = value.max(field.maxLength);
      schema = value;
      break;
    }
    case "integer":
    case "number": {
      let value = z.number();
      if (field.type === "integer") value = value.int();
      if (field.minimum !== undefined) value = value.min(field.minimum);
      if (field.maximum !== undefined) value = value.max(field.maximum);
      schema = value;
      break;
    }
    case "boolean":
      schema = z.boolean();
      break;
    case "array": {
      let item = z.string();
      if (field.items?.maxLength !== undefined) {
        if (!Number.isInteger(field.items.maxLength) || field.items.maxLength < 0) throw new Error("数组元素长度无效");
        item = item.max(field.items.maxLength);
      }
      let value = z.array(item);
      if (field.maxItems !== undefined) value = value.max(field.maxItems);
      schema = value;
      break;
    }
  }
  if (field.enum !== undefined) {
    if (
      !Array.isArray(field.enum) ||
      !field.enum.length ||
      !["string", "number", "integer"].includes(field.type) ||
      field.enum.some((entry) => !schema.safeParse(entry).success)
    )
      throw new Error("参数枚举无效");
    schema = schema.and(z.union(field.enum.map((entry) => z.literal(entry))));
  }
  return field.description ? schema.describe(field.description) : schema;
}

/** Compile a validated contribution while reserving host account and idempotency parameters */
export function pluginTool(manifest: PluginManifest, tool: PluginToolContribution): ToolDefinition {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, field] of Object.entries(tool.input?.properties ?? {})) {
    if (["account", "idempotencyKey"].includes(name)) throw new Error(`参数 ${name} 由宿主保留`);
    const schema = fieldSchema(field);
    shape[name] = tool.input?.required?.includes(name) ? schema : schema.optional();
  }
  const readOnly = tool.risk === "read";
  return {
    name: pluginToolName(manifest.id, tool.id),
    method: "business",
    invoke: `plugin:${manifest.id}:${tool.id}`,
    plugin: { pluginId: manifest.id, toolId: tool.id, permissions: [...(manifest.permissions ?? [])] },
    title: tool.title,
    description: `来自插件「${manifest.name}」：${tool.description} account 未传时使用已授权默认账号。${readOnly ? "" : "重复请求复用 idempotencyKey；结果 unknown 禁止自动重试。"}`,
    permission: tool.permission,
    readOnly,
    schema: z.strictObject({
      ...shape,
      account: z.string().min(1).max(128).optional(),
      ...(readOnly ? {} : { idempotencyKey: z.string().min(1).max(128) }),
    }),
  };
}
