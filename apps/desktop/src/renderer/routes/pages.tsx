import { EmptyState, type PluginPrefetch, usePluginRegistry } from "@glaze/plugin-sdk";
import { type ComponentType, type LazyExoticComponent, lazy, Suspense, useEffect, useState } from "react";
import { loadPluginModule, manifests } from "../plugins/catalog";
import { PageBoundary } from "./PageBoundary";
import { PagePlaceholder } from "./PagePlaceholder";

const routeComponents = new Map<string, LazyExoticComponent<ComponentType>>();

/** Split a route key into its plugin and page ids */
function splitRoute(route: string): [string, string] {
  const index = route.lastIndexOf("/");
  return [route.slice(0, index), route.slice(index + 1)];
}

/** Page declared in a manifest whose module does not provide it */
function missingPage(title: string): ComponentType {
  return () => <PagePlaceholder title={title} />;
}

/** Lazy component for a route, resolved from the owning plugin's module and cached across visits */
function routeComponent(route: string, title: string): LazyExoticComponent<ComponentType> {
  let component = routeComponents.get(route);
  if (!component) {
    const [pluginId, pageId] = splitRoute(route);
    component = lazy(() =>
      loadPluginModule(pluginId).then((module) => ({ default: module.pages?.[pageId] ?? missingPage(title) })),
    );
    routeComponents.set(route, component);
  }
  return component;
}

/** Start downloading a page's code and let its plugin warm the page's first data, e.g. on hover */
export function preloadRoute(route: string, prefetch?: Parameters<PluginPrefetch>[0]): void {
  const [pluginId, pageId] = splitRoute(route);
  if (!manifests.some((manifest) => manifest.id === pluginId)) return;
  void loadPluginModule(pluginId)
    .then((module) => {
      if (prefetch) module.prefetch?.[pageId]?.(prefetch);
    })
    .catch(() => undefined);
}

/** Show the loading hint only when page code takes noticeably long, avoiding a flash on fast loads */
function PageFallback() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, []);
  return visible ? <EmptyState title="正在加载页面…" /> : null;
}

/** Render the page a plugin registered for a route; the registry decides whether its plugin is enabled */
export function RouteView({ route, title }: { route: string; title: string }) {
  const registry = usePluginRegistry();
  const [pluginId] = splitRoute(route);
  if (registry?.snapshot && !registry.snapshot.plugins.find((plugin) => plugin.id === pluginId)?.enabled)
    return <EmptyState title="此插件已停用" hint="可在设置的插件页重新启用" />;
  if (!manifests.some((manifest) => manifest.id === pluginId)) return <PagePlaceholder title={title} />;
  const Page = routeComponent(route, title);
  return (
    <PageBoundary key={route}>
      <Suspense fallback={<PageFallback />}>
        <Page />
      </Suspense>
    </PageBoundary>
  );
}
