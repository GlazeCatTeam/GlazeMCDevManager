import type { PluginCatalog, PluginManifest, PluginModule } from "@glaze/plugin-sdk";

// Built-in plugins are discovered from their manifests at build time; code loads only when needed
const manifestFiles = import.meta.glob<PluginManifest & { entries?: { ui?: string } }>(
  "../../../../../plugins/*/glaze-plugin.json",
  { eager: true, import: "default" },
);
const moduleFiles = import.meta.glob<{ default: PluginModule }>("../../../../../plugins/*/src/index.{ts,tsx}");

const loaders = new Map<string, () => Promise<{ default: PluginModule }>>();
for (const [path, manifest] of Object.entries(manifestFiles)) {
  const loader = moduleFiles[path.replace(/glaze-plugin\.json$/, manifest.entries?.ui ?? "src/index.ts")];
  if (loader) loaders.set(manifest.id, loader);
}

export const manifests: readonly PluginManifest[] = Object.values(manifestFiles);
const modules = new Map<string, Promise<PluginModule>>();

/** Load a plugin's runtime module once; a failed download can be retried */
export function loadPluginModule(pluginId: string): Promise<PluginModule> {
  let pending = modules.get(pluginId);
  if (!pending) {
    const loader = loaders.get(pluginId);
    pending = loader
      ? loader().then((module) => module.default)
      : Promise.reject(new Error(`插件 ${pluginId} 没有可加载的界面代码`));
    pending.catch(() => modules.delete(pluginId));
    modules.set(pluginId, pending);
  }
  return pending;
}

export const catalog: PluginCatalog = { manifests, load: loadPluginModule };
