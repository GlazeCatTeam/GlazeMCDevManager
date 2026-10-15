import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

/** Reject symbolic links and ensure every managed path stays inside its application-owned root */
export function ownedPath(root: string, ...parts: string[]): string {
  const base = resolve(root);
  const target = resolve(base, ...parts);
  const suffix = relative(base, target);
  if (suffix.startsWith("..") || isAbsolute(suffix)) throw new Error("路径超出应用目录");
  let current = target;
  while (current !== dirname(base)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("应用目录不能包含符号链接");
    if (current === base) break;
    current = dirname(current);
  }
  return target;
}

/** Create a managed directory and verify its real location before writing */
export function ensureOwnedDirectory(root: string, ...parts: string[]): string {
  const path = ownedPath(root, ...parts);
  mkdirSync(path, { recursive: true });
  const realRoot = realpathSync(root);
  const suffix = relative(realRoot, realpathSync(path));
  if (suffix.startsWith("..") || isAbsolute(suffix)) throw new Error("目录实际位置超出应用目录");
  return path;
}
