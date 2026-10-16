import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { DependencyLicense } from "@glaze/contracts";

interface PackageMetadata {
  name: string;
  version: string;
  license?: string;
  author?: string | { name?: string };
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

// Packages that declare a license in package.json but ship no license file; any other missing text fails the build
const declaredOnly: Record<string, "MIT"> = { "lazy-val": "MIT" };

/** Standard MIT text for a declared-only package, labelled so the about page does not present it as the package's own file */
function mitNotice(pkg: PackageMetadata) {
  const author = typeof pkg.author === "string" ? pkg.author : (pkg.author?.name ?? pkg.name);
  return {
    file: "LICENSE（包内未附原文，按 package.json 声明的 MIT 生成）",
    text: `MIT License

Copyright (c) ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
  };
}

/** Resolve package metadata even when the dependency's exports hide package.json */
function packageDirectory(name: string, from: string): string {
  const require = createRequire(join(from, "package.json"));
  for (const search of require.resolve.paths(name) ?? []) {
    const directory = join(search, name);
    if (existsSync(join(directory, "package.json"))) return realpathSync(directory);
  }
  throw new Error(`Cannot collect license for missing dependency: ${name}`);
}

/** Collect installed production dependencies through workspace packages, plus the shipped Electron runtime */
export function collectLicenseNotices(desktop: string): DependencyLicense[] {
  const visited = new Set<string>();
  const entries = new Map<string, DependencyLicense>();
  /** Walk each physical package once and retain its complete license and notice files */
  const visit = (directory: string, runtime = false) => {
    const actual = realpathSync(directory);
    if (visited.has(actual)) return;
    visited.add(actual);
    const pkg = JSON.parse(readFileSync(join(actual, "package.json"), "utf8")) as PackageMetadata;
    if (!pkg.name.startsWith("@glaze/")) {
      const notices = readdirSync(actual)
        .filter((file) => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(file))
        .sort()
        .map((file) => ({ file, text: readFileSync(join(actual, file), "utf8") }));
      if (!notices.length && declaredOnly[pkg.name] && pkg.license === declaredOnly[pkg.name])
        notices.push(mitNotice(pkg));
      if (!notices.length) throw new Error(`Missing license text for ${pkg.name}@${pkg.version}`);
      entries.set(`${pkg.name}@${pkg.version}`, {
        name: pkg.name,
        version: pkg.version,
        license: pkg.license ?? "未声明",
        notices,
      });
    }
    // Electron's npm dependencies install the binary; they are not part of the shipped runtime
    if (runtime) return;
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (!(name in (pkg.optionalDependencies ?? {}))) visit(packageDirectory(name, actual));
    }
    for (const name of Object.keys(pkg.optionalDependencies ?? {})) {
      let optional: string;
      try {
        optional = packageDirectory(name, actual);
      } catch {
        continue;
      }
      visit(optional);
    }
  };
  visit(resolve(desktop));
  visit(packageDirectory("electron", desktop), true);
  for (const [plugin, label] of [
    ["works", "作品管理"],
    ["analytics", "数据分析"],
  ] as const) {
    const file = `plugins/${plugin}/src/assets/minecraft/LICENSE.md`;
    entries.set(file, {
      name: `Minecraft 图标（${label}）`,
      version: "内置资源",
      license: "独立声明 · Minecraft EULA",
      notices: [{ file, text: readFileSync(resolve(desktop, "../..", file), "utf8") }],
    });
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}
