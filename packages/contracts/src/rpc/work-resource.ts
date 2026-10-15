import { isWorkRecord, type WorkEditorOptions, type WorkRecord, type WorkValue } from "./work-editor";

export const workResourceExtensions = ["zip", "mcworld", "mcpack", "mcaddon", "png"] as const;
export interface WorkResourceUploadParams {
  account: string;
  itemId?: string;
  resourceType: number;
}

/** Map supported filenames to the platform's resource format groups */
export function workResourceFormat(name: string): "zip" | "png" | null {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "png") return "png";
  return ["zip", "mcworld", "mcpack", "mcaddon"].includes(extension ?? "") ? "zip" : null;
}

/** Apply live category restrictions to both file selection and saving */
export function workResourceAllowed(name: string, type: number, options: WorkEditorOptions): boolean {
  const format = workResourceFormat(name);
  const accepted = options.peResourceFileTypes?.[String(type)] ?? [];
  return format !== null && (!accepted.length || accepted.includes(format));
}

/** Translate old local draft aliases while preserving platform dependency metadata */
export function normalizePcRequirements(value: WorkValue): WorkValue {
  if (!Array.isArray(value)) return value;
  return value.map((row) => {
    if (!isWorkRecord(row)) return row;
    const { id, name, ...rest } = row;
    return { ...rest, item_id: rest.item_id ?? id ?? "", item_name: rest.item_name ?? name ?? "" };
  });
}

/** Match PE and PC dictionary titles without assuming shared numeric ids */
export function matchPcClassification(pe: WorkRecord, pc: WorkRecord, options: WorkEditorOptions): WorkRecord {
  const titles: Record<string, string[]> = {
    地图: ["地图组件", "地图模组"],
    add_ons: ["功能组件", "功能模组"],
    材质光影: ["视觉组件", "视觉模组"],
    皮肤: ["形象组件", "形象模组"],
    联机大厅: ["联机大厅"],
    礼包: ["礼包"],
  };
  const source = options.peTypes.find((type) => type.id === pe.pri_type)?.title ?? "";
  const candidates = options.pcTypes.filter((type) => (titles[source] ?? [source]).includes(type.title));
  const type = options.pcTypes.some((type) => type.id === pc.pri_type)
    ? Number(pc.pri_type)
    : candidates.length === 1
      ? (candidates[0]?.id ?? 0)
      : 0;
  const subtypes = options.pcSubTypes[String(type)] ?? [];
  const sourceSub = options.peSubTypes[String(pe.pri_type)]?.find((sub) => sub.id === pe.sub_type)?.title;
  const matches = subtypes.filter((sub) => sub.title === sourceSub);
  const subtype = subtypes.some((sub) => sub.id === pc.sub_type)
    ? Number(pc.sub_type)
    : matches.length === 1
      ? (matches[0]?.id ?? 0)
      : 0;
  return { ...pc, pri_type: type, sub_type: subtype };
}
