import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkRecord } from "../packages/contracts/src";
import { validateWorkAssetUsage } from "../packages/mcp/src/asset-usage";
import type { StoredAsset } from "../packages/mcp/src/model";

/** Model a host upload whose signed payload must survive usage validation unchanged */
function material(metadata: Partial<StoredAsset>): StoredAsset {
  return {
    id: "asset",
    draftId: "draft",
    name: "file",
    path: "unused",
    hash: "fixture",
    size: 10,
    kind: "image",
    platform: "pe",
    uploaded: true,
    expiresAt: Date.now() + 60000,
    receipt: {
      name: "file",
      size: 10,
      url: "https://x19.fp.ps.netease.com/file",
      receipt: { body: "{}", sign: "TEST_ONLY", file_type: "image" },
    },
    ...metadata,
  };
}

test("usage validation accepts matching PC images, resources, covers and URL-only image roles", () => {
  const ref = { $asset: "asset", as: "receipt" };
  const cases: [Partial<StoredAsset>, WorkRecord][] = [
    [
      { kind: "image", platform: "pc", channelId: 7 },
      { sync_item_info: { channel: [{ channel_id: 7, channel_url: ref }] } },
    ],
    [
      { kind: "resource", resourceType: 2 },
      { pri_type: 2, res: [{ res_url: ref }] },
    ],
    [{ kind: "video" }, { video_info_list: [{ url: ref }] }],
    [{ kind: "videoCover" }, { video_info_list: [{ cover: ref }] }],
    [{ kind: "banner" }, { banner_pic: { ...ref, as: "url" } }],
    [{ kind: "proof" }, { corp_proof_image: { ...ref, as: "url" } }],
  ];
  for (const [metadata, patch] of cases) {
    const asset = material(metadata);
    const before = structuredClone({ patch, asset });
    assert.doesNotThrow(() => validateWorkAssetUsage(patch, {}, [asset]));
    assert.deepEqual({ patch, asset }, before);
  }
});

test("changing category revalidates a retained uploaded resource against the new category", () => {
  const asset = material({ kind: "resource", resourceType: 2 });
  const original = { pri_type: 2, res: [{ res_url: asset.receipt?.url ?? "" }] };
  assert.doesNotThrow(() => validateWorkAssetUsage({ pri_type: 2 }, original, [asset]));
  assert.throws(() => validateWorkAssetUsage({ pri_type: 1 }, original, [asset]), /资源类别/);
});

test("usage validation preserves existing platform media and rejects mismatched PC slots", () => {
  const url = "https://x19.fp.ps.netease.com/existing.png";
  assert.doesNotThrow(() => validateWorkAssetUsage({ channel: [{ channel_id: 5, channel_url: url }] }, {}, []));
  for (const metadata of [
    { platform: "pe" as const, channelId: 7 },
    { platform: "pc" as const, channelId: 8 },
  ]) {
    assert.throws(
      () =>
        validateWorkAssetUsage(
          {
            sync_item_info: { channel: [{ channel_id: 7, channel_url: { $asset: "asset", as: "receipt" } }] },
          },
          {},
          [material(metadata)],
        ),
      /图片位/,
    );
  }
});
