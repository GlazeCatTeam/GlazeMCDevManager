import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

// Render the AppLogo grass block (packages/ui/src/components/AppLogo.tsx) into the installer's icon.ico.
// Run `node tools/build-icon.mjs` after changing the logo; the output is committed.
const output = fileURLToPath(new URL("../apps/desktop/resources/", import.meta.url));

/** Same rectangles as AppLogo on its 16-unit grid; detailed ones only from 32px up */
const shapes = [
  [1, 1, 14, 14, "#8B5A2B"],
  [1, 1, 14, 5, "#5DA130"],
  [3, 6, 2, 1, "#5DA130"],
  [9, 6, 1, 2, "#5DA130"],
  [13, 6, 1, 1, "#5DA130"],
];
const details = [
  [5, 10, 1, 1, "#6B4320"],
  [11, 12, 1, 1, "#6B4320"],
  [2, 2, 3, 1, "#7BC24A"],
];

/** RGBA pixels with nearest-neighbour scaling, matching crispEdges rendering */
function render(size) {
  const grid = Array.from({ length: 16 }, () => Array(16).fill(null));
  for (const [x, y, w, h, color] of size >= 32 ? [...shapes, ...details] : shapes)
    for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) grid[row][col] = color;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const color = grid[Math.floor((y * 16) / size)][Math.floor((x * 16) / size)];
      if (!color) continue;
      const offset = (y * size + x) * 4;
      pixels[offset] = Number.parseInt(color.slice(1, 3), 16);
      pixels[offset + 1] = Number.parseInt(color.slice(3, 5), 16);
      pixels[offset + 2] = Number.parseInt(color.slice(5, 7), 16);
      pixels[offset + 3] = 255;
    }
  return pixels;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Minimal RGBA PNG */
function png(size) {
  const pixels = render(size);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO with PNG-compressed entries (Windows Vista and later); 256px is required by electron-builder */
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map(png);
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
sizes.forEach((size, index) => {
  const entry = 6 + index * 16;
  directory.writeUInt8(size === 256 ? 0 : size, entry);
  directory.writeUInt8(size === 256 ? 0 : size, entry + 1);
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(images[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
});
mkdirSync(output, { recursive: true });
writeFileSync(`${output}icon.ico`, Buffer.concat([directory, ...images]));
writeFileSync(`${output}icon.png`, images.at(-1));
console.log(`已生成 ${output}icon.ico（${sizes.join("、")}px）与 icon.png`);
