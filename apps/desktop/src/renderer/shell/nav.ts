import { type IconName, pixelIcons } from "@glaze/ui";

// Temporary stand-in for the plugin registry (M1): read built-in plugin manifests at build time

interface PluginManifest {
  id: string;
  contributes: {
    pages: { id: string; title: string; chrome?: "none" }[];
    navItems?: { page: string; icon: string; group: "top" | "bottom"; order: number }[];
  };
}

export interface NavEntry {
  /** Route key: <pluginId>/<pageId> */
  route: string;
  title: string;
  icon: IconName | undefined;
  group: "top" | "bottom";
  order: number;
}

export interface PageInfo {
  title: string;
  /** "none": full-window page without the side navigation, e.g. login */
  chrome: "workbench" | "none";
}

const manifests = import.meta.glob<PluginManifest>("../../../../../plugins/*/glaze-plugin.json", {
  eager: true,
  import: "default",
});

/** Check that a manifest icon name exists in the built-in icon set */
function isIconName(name: string): name is IconName {
  return Object.hasOwn(pixelIcons, name);
}

/** Collect nav entries from all built-in plugins, sorted by order within each group */
export function loadNavEntries(): NavEntry[] {
  const entries: NavEntry[] = [];
  for (const manifest of Object.values(manifests)) {
    for (const item of manifest.contributes.navItems ?? []) {
      const page = manifest.contributes.pages.find((p) => p.id === item.page);
      if (!page) {
        continue;
      }
      entries.push({
        route: `${manifest.id}/${page.id}`,
        title: page.title,
        icon: isIconName(item.icon) ? item.icon : undefined,
        group: item.group,
        order: item.order,
      });
    }
  }
  return entries.sort((a, b) => a.order - b.order);
}

/** Collect every page contributed by built-in plugins, keyed by route */
export function loadPages(): Map<string, PageInfo> {
  const pages = new Map<string, PageInfo>();
  for (const manifest of Object.values(manifests)) {
    for (const page of manifest.contributes.pages) {
      pages.set(`${manifest.id}/${page.id}`, { title: page.title, chrome: page.chrome ?? "workbench" });
    }
  }
  return pages;
}
