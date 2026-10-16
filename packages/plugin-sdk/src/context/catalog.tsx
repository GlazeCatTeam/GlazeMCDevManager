import type { PluginHomeWidgetContribution, PluginManifest, PluginSettingsSectionContribution } from "@glaze/contracts";
import { type ComponentType, createContext, type LazyExoticComponent, lazy, useContext, useMemo } from "react";
import type { PluginModule } from "../plugin";
import { usePluginRegistry } from "./plugins";

/** Manifests known to the shell plus an on-demand loader for each plugin's runtime module */
export interface PluginCatalog {
  manifests: readonly PluginManifest[];
  load(pluginId: string): Promise<PluginModule>;
}

const Context = createContext<PluginCatalog | null>(null);

/** Provided by the shell; previews may omit it, in which case no contributions are shown */
export const PluginCatalogProvider = Context.Provider;

/** The shell's plugin catalog, or null outside the app */
export function usePluginCatalog(): PluginCatalog | null {
  return useContext(Context);
}

type SlotKind = "settingsSections" | "homeWidgets";
type SlotContribution<K extends SlotKind> = K extends "settingsSections"
  ? PluginSettingsSectionContribution
  : PluginHomeWidgetContribution;

export interface PluginContribution<K extends SlotKind> {
  pluginId: string;
  contribution: SlotContribution<K>;
  Component: LazyExoticComponent<ComponentType>;
}

const components = new Map<string, LazyExoticComponent<ComponentType>>();

/** Shown when a manifest declares an id the module does not implement */
function Missing() {
  return null;
}

/** Lazy component for one contribution, cached so remounts keep their loaded code */
function contributionComponent(
  catalog: PluginCatalog,
  pluginId: string,
  kind: SlotKind,
  id: string,
): LazyExoticComponent<ComponentType> {
  const key = `${pluginId}/${kind}/${id}`;
  let component = components.get(key);
  if (!component) {
    component = lazy(() => catalog.load(pluginId).then((module) => ({ default: module[kind]?.[id] ?? Missing })));
    components.set(key, component);
  }
  return component;
}

/** Contributions of enabled plugins for one slot, sorted by their declared order */
export function useContributions<K extends SlotKind>(kind: K): PluginContribution<K>[] {
  const catalog = usePluginCatalog();
  const registry = usePluginRegistry();
  const states = registry?.snapshot?.plugins;
  return useMemo(() => {
    if (!catalog) return [];
    const enabled = (id: string) => !states || states.some((plugin) => plugin.id === id && plugin.enabled);
    return catalog.manifests
      .filter((manifest) => enabled(manifest.id))
      .flatMap((manifest) =>
        ((manifest.contributes?.[kind] ?? []) as SlotContribution<K>[]).map((contribution) => ({
          pluginId: manifest.id,
          contribution,
          Component: contributionComponent(catalog, manifest.id, kind, contribution.id),
        })),
      )
      .sort((a, b) => a.contribution.order - b.contribution.order);
  }, [catalog, states, kind]);
}
