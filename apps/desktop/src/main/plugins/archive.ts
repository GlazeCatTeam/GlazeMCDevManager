import { crc32, inflateRawSync } from "node:zlib";

/** Read a small ZIP as data only; nothing is extracted to caller-controlled filesystem paths */
export function readPluginZip(bytes: Buffer): Map<string, Buffer> {
  if (bytes.length > 2 * 1024 * 1024 || bytes.length < 22) throw new Error("插件包大小无效，最大为 2 MB");
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || end < bytes.length - 65557 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)
    throw new Error("插件包不是有效 ZIP");
  const count = bytes.readUInt16LE(end + 10);
  const centralSize = bytes.readUInt32LE(end + 12);
  const centralStart = bytes.readUInt32LE(end + 16);
  if (
    count < 2 ||
    count > 32 ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0 ||
    count !== bytes.readUInt16LE(end + 8) ||
    centralStart + centralSize !== end
  )
    throw new Error("不支持分卷、ZIP64 或异常文件数量");
  const result = new Map<string, Buffer>();
  const ranges: [number, number][] = [];
  let offset = centralStart;
  let total = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP 目录损坏");
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10);
    const crc = bytes.readUInt32LE(offset + 16),
      compressed = bytes.readUInt32LE(offset + 20),
      size = bytes.readUInt32LE(offset + 24);
    const length = bytes.readUInt16LE(offset + 28),
      extra = bytes.readUInt16LE(offset + 30),
      comment = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42),
      mode = bytes.readUInt32LE(offset + 38) >>> 16;
    const next = offset + 46 + length + extra + comment;
    if (next > end || flags & 1 || ![0, 8].includes(method) || size > 1024 * 1024 || (mode & 0xf000) === 0xa000)
      throw new Error("插件包包含不支持的压缩、加密或链接文件");
    const name = bytes.subarray(offset + 46, offset + 46 + length).toString("utf8");
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(name) ||
      name.startsWith("/") ||
      name.split("/").some((part) => part === ".." || part === ".") ||
      result.has(name)
    )
      throw new Error("插件包路径无效或重复");
    if (
      local + 30 > centralStart ||
      bytes.readUInt32LE(local) !== 0x04034b50 ||
      bytes.readUInt16LE(local + 8) !== method ||
      bytes.readUInt16LE(local + 6) !== flags
    )
      throw new Error("ZIP 文件头损坏");
    const localNameLength = bytes.readUInt16LE(local + 26);
    const start = local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    const stop = start + compressed;
    if (
      stop > centralStart ||
      bytes.subarray(local + 30, local + 30 + localNameLength).toString("utf8") !== name ||
      ranges.some(([a, b]) => local < b && stop > a)
    )
      throw new Error("ZIP 文件范围重叠或越界");
    ranges.push([local, stop]);
    const data =
      method === 0
        ? bytes.subarray(start, stop)
        : inflateRawSync(bytes.subarray(start, stop), { maxOutputLength: 1024 * 1024 });
    total += data.length;
    if (data.length !== size || crc32(data) !== crc || total > 2 * 1024 * 1024)
      throw new Error("插件文件校验失败或解压后过大");
    if (!name.endsWith("/")) result.set(name, data);
    offset = next;
  }
  if (offset !== end) throw new Error("ZIP 目录长度无效");
  return result;
}
