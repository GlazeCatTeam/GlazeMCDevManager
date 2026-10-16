import { capabilities, type RpcMethod } from "@glaze/contracts";

// Modules whose platform data views cache in the renderer
const DATA_MODULES = new Set(["works", "promotion", "comments", "feedback", "messages", "income", "analytics"]);
// Writes that only stage files and leave platform records unchanged
const STAGING = /upload|image|prepare|discard/i;

/** Module whose platform data a successful call may have changed, or null for reads and app-only methods */
export function changedModule(method: string): string | null {
  const module = method.split(".")[0] ?? "";
  if (!DATA_MODULES.has(module) || STAGING.test(method.slice(module.length + 1))) return null;
  return capabilities[method as RpcMethod]?.risk === "read" ? null : module;
}
