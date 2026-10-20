import { isWorkRecord, type WorkRecord, type WorkValue } from "@glaze/contracts";
import { canonical, McpError, type StoredAsset } from "./model";

/** Keep uploaded media bound to the purpose, platform and slot validated by the host */
export function validateWorkAssetUsage(patch: WorkRecord, original: WorkRecord, assets: StoredAsset[]): void {
  const fields = { ...original, ...patch };
  /** Check opaque references, signed receipts and URLs through the same material metadata */
  const check = (
    value: WorkValue | undefined,
    kind: StoredAsset["kind"],
    platform: "pe" | "pc",
    channelId?: WorkValue,
    resourceType?: WorkValue,
  ) => {
    const matches = assets.filter((asset) => {
      if (isWorkRecord(value))
        return "$asset" in value ? asset.id === value.$asset : canonical(asset.receipt?.receipt) === canonical(value);
      return typeof value === "string" && !!value && asset.receipt?.url === value;
    });
    if (
      matches.length &&
      !matches.some(
        (asset) =>
          asset.kind === kind &&
          asset.platform === platform &&
          (kind !== "image" || asset.channelId === channelId) &&
          (kind !== "resource" || asset.resourceType === resourceType),
      )
    )
      throw new McpError("validation", "材料用途、平台、图片位或资源类别与目标字段不匹配，请按目标用途重新上传");
  };
  /** Validate the slot identity before opaque image references are replaced by their receipts */
  const channels = (value: WorkValue | undefined, platform: "pe" | "pc") => {
    if (Array.isArray(value))
      for (const row of value) if (isWorkRecord(row)) check(row.channel_url, "image", platform, row.channel_id);
  };
  channels(patch.channel, "pe");
  if (isWorkRecord(patch.sync_item_info)) channels(patch.sync_item_info.channel, "pc");
  const resources = "pri_type" in patch ? fields.res : patch.res;
  if (Array.isArray(resources))
    for (const row of resources)
      if (isWorkRecord(row)) check(row.res_url, "resource", "pe", undefined, fields.pri_type);
  if (Array.isArray(patch.video_info_list))
    for (const row of patch.video_info_list)
      if (isWorkRecord(row)) {
        check(row.url, "video", "pe");
        check(row.cover, "videoCover", "pe");
      }
  check(patch.banner_pic, "banner", "pe");
  check(patch.corp_proof_image, "proof", "pe");
}
