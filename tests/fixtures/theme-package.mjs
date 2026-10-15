import { crc32, deflateRawSync } from "node:zlib";

/** Build standard ZIP fixtures independently of the production archive reader */
export function zipFiles(files, deflate = false) {
  const bodies = [],
    directory = [];
  let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const filename = Buffer.from(name),
      plain = Buffer.from(value),
      data = deflate ? deflateRawSync(plain) : plain;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc32(plain), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(plain.length, 22);
    local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc32(plain), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(plain.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    bodies.push(local, filename, data);
    directory.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...bodies, central, end]);
}

/** Small usable theme package for unit and Electron installation tests */
export function themeFixture(version = "1.0.0") {
  const manifest = {
    id: "demo.ocean",
    name: "海洋测试主题",
    version,
    description: "离线测试主题",
    engines: { glaze: "^0.1.0" },
    permissions: [],
    contributes: { themes: [{ id: "demo.ocean", path: "theme.json" }] },
  };
  const definition = { id: "demo.ocean", defaultVariant: "dark", tokens: { semantic: { "surface.app": "#234567" } } };
  return {
    manifest,
    definition,
    bytes: zipFiles({ "glaze-plugin.json": JSON.stringify(manifest), "theme.json": JSON.stringify(definition) }, true),
  };
}
