/** Validate bounded MP4 metadata without executing a media tool or reading arbitrary paths */
export function validateWorkVideo(buffer: Buffer): void {
  let duration = 0;
  let width = 0;
  let height = 0;
  const codecs: string[] = [];
  /** Walk only containers required for duration, dimensions and codec declarations */
  function boxes(start: number, end: number, depth: number): void {
    if (depth > 10) throw new Error("视频容器层级无效");
    for (let offset = start; offset + 8 <= end; ) {
      let size = buffer.readUInt32BE(offset);
      const kind = buffer.toString("ascii", offset + 4, offset + 8);
      let header = 8;
      if (size === 1) {
        if (offset + 16 > end) throw new Error("视频文件损坏");
        size = Number(buffer.readBigUInt64BE(offset + 8));
        header = 16;
      }
      if (size === 0) size = end - offset;
      if (size < header || offset + size > end) throw new Error("视频文件损坏");
      const data = offset + header;
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(kind)) boxes(data, offset + size, depth + 1);
      if (kind === "mvhd" && size - header >= 32) {
        const version = buffer[data];
        const scale = buffer.readUInt32BE(data + (version === 1 ? 20 : 12));
        const ticks = version === 1 ? Number(buffer.readBigUInt64BE(data + 24)) : buffer.readUInt32BE(data + 16);
        duration = scale ? ticks / scale : 0;
      }
      if (kind === "tkhd" && size - header >= 84) {
        const w = buffer.readUInt32BE(offset + size - 8) / 65536;
        const h = buffer.readUInt32BE(offset + size - 4) / 65536;
        if (w > 0 && h > 0) {
          width = w;
          height = h;
        }
      }
      if (kind === "stsd" && size - header >= 16) codecs.push(buffer.toString("ascii", data + 12, data + 16));
      offset += size;
    }
  }
  boxes(0, buffer.length, 0);
  if (!duration || duration > 90 || !height || Math.abs(width / height - 16 / 9) > 0.02)
    throw new Error("视频须为 16:9，时长不超过 1 分 30 秒");
  if (!codecs.some((c) => c === "avc1" || c === "avc3") || codecs.some((c) => !["avc1", "avc3", "mp4a"].includes(c)))
    throw new Error("视频需使用 H.264 视频和 AAC 音频编码");
}
