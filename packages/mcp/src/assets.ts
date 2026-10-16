import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readdir, realpath, rm, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { McpAsset } from "@glaze/contracts";
import { McpError, type StoredAsset } from "./model";

/** Resolve only regular files beneath the granted directory, rejecting reparse-point escapes */
export async function resolveMaterial(directory: string, input: string): Promise<string> {
  if (
    isAbsolute(input) ||
    input.includes(":") ||
    input.includes(String.fromCharCode(0)) ||
    input.startsWith("\\") ||
    input.split(/[\\/]/).includes("..")
  )
    throw new McpError("forbidden", "素材路径必须位于授权目录内");
  const root = await realpath(directory);
  if (root.startsWith("\\\\")) throw new McpError("forbidden", "不支持网络素材目录");
  const target = resolve(root, input);
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new McpError("forbidden", "素材路径越界");
  let part = root;
  for (const segment of rel.split(sep)) {
    part = join(part, segment);
    if ((await lstat(part)).isSymbolicLink()) throw new McpError("forbidden", "素材路径不能包含链接或联接点");
  }
  const actual = await realpath(target);
  const actualRel = relative(root, actual);
  if (actualRel.startsWith("..") || isAbsolute(actualRel)) throw new McpError("forbidden", "素材实际路径越界");
  return actual;
}

/** Snapshot files as streams; never retain or upload a mutable source path */
export async function snapshotMaterial(
  root: string,
  source: string,
  metadata: Pick<McpAsset, "draftId" | "kind" | "platform" | "channelId" | "resourceType">,
): Promise<StoredAsset> {
  const before = await stat(source);
  const limit = (metadata.kind === "resource" ? 2048 : metadata.kind === "video" ? 50 : 10) * 1024 * 1024;
  if (!before.isFile() || before.size <= 0 || before.size > limit)
    throw new McpError("validation", "素材为空、类型错误或超过大小限制");
  await mkdir(root, { recursive: true });
  if ((await lstat(root)).isSymbolicLink()) throw new McpError("forbidden", "材料快照目录不能是链接");
  const id = randomUUID();
  const path = join(root, id + extname(source).toLowerCase());
  const hash = createHash("sha256");
  let size = 0;
  try {
    await pipeline(
      createReadStream(source),
      new Transform({
        transform(chunk: Buffer, _encoding, done) {
          size += chunk.length;
          if (size > limit) {
            done(new McpError("validation", "素材超过大小限制"));
            return;
          }
          hash.update(chunk);
          done(null, chunk);
        },
      }),
      createWriteStream(path, { flags: "wx", mode: 0o600 }),
    );
    const after = await stat(source);
    if (size !== before.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino)
      throw new McpError("conflict", "导入期间文件发生变化，请重新选择");
    return {
      ...metadata,
      id,
      path,
      name: basename(source),
      size,
      hash: hash.digest("hex"),
      uploaded: false,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
  } catch (error) {
    await rm(path, { force: true });
    throw error;
  }
}

/** Verify immutable material bytes again immediately before the upload */
export async function verifyMaterial(asset: StoredAsset): Promise<void> {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(asset.path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  if (size !== asset.size || hash.digest("hex") !== asset.hash || asset.expiresAt < Date.now())
    throw new McpError("conflict", "材料已变化或过期，请重新导入");
}

/** Delete only expired generated snapshots, never user-selected source files */
export async function cleanMaterials(root: string, retained: Set<string>, now = Date.now()): Promise<void> {
  try {
    if ((await lstat(root)).isSymbolicLink()) return;
  } catch {
    return;
  }
  const actualRoot = await realpath(root);
  for (const name of await readdir(actualRoot)) {
    if (!/^[\da-f-]{36}\.[a-z0-9]{1,12}$/.test(name) || retained.has(name)) continue;
    const path = resolve(actualRoot, name);
    if (relative(actualRoot, path) !== name) continue;
    const info = await lstat(path);
    if (!info.isSymbolicLink() && info.isFile() && info.mtimeMs < now - 24 * 60 * 60 * 1000)
      await rm(path, { force: true });
  }
}
