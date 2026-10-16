import { type IconName, pixelIcons } from "@glaze/ui";
import { manifests } from "../plugins/catalog";

export interface NavEntry {
  /** Route key: <pluginId>/<pageId> */
  route: string;
  title: string;
  icon: IconName | undefined;
  group: "top" | "bottom";
  order: number;
  /** Sidebar group label for top entries */
  section: string | undefined;
}

export interface PageInfo {
  title: string;
  /** "none": full-window page without the side navigation, e.g. login */
  chrome: "workbench" | "none";
}

/** Check that a manifest icon name exists in the built-in icon set */
function isIconName(name: string): name is IconName {
  return Object.hasOwn(pixelIcons, name);
}

/** Collect nav entries from all plugin manifests, sorted by order within each group */
export function loadNavEntries(): NavEntry[] {
  const entries: NavEntry[] = [];
  for (const manifest of manifests) {
    const pages = manifest.contributes?.pages ?? [];
    for (const item of manifest.contributes?.navItems ?? []) {
      const page = pages.find((p) => p.id === item.page);
      if (!page) continue;
      entries.push({
        route: `${manifest.id}/${page.id}`,
        title: page.title,
        icon: isIconName(item.icon) ? item.icon : undefined,
        group: item.group,
        order: item.order,
        section: item.section,
      });
    }
  }
  return entries.sort((a, b) => a.order - b.order);
}

/** Collect every page contributed by plugins, keyed by route */
export function loadPages(): Map<string, PageInfo> {
  const pages = new Map<string, PageInfo>();
  for (const manifest of manifests)
    for (const page of manifest.contributes?.pages ?? [])
      pages.set(`${manifest.id}/${page.id}`, { title: page.title, chrome: page.chrome ?? "workbench" });
  return pages;
}
