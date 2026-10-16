import { AccountPage, LoginExpiredPage, LoginPage } from "@glaze/plugin-account";
import { AssistantPage } from "@glaze/plugin-assistant";
import { HomePage } from "@glaze/plugin-home";
import { EmptyState, usePluginRegistry } from "@glaze/plugin-sdk";
import { SettingsPage } from "@glaze/plugin-settings";
import { type ComponentType, lazy, Suspense, useEffect, useState } from "react";
import { useAppearance } from "../shell/Appearance";
import { PageBoundary } from "./PageBoundary";
import { PagePlaceholder } from "./PagePlaceholder";

const preloaders: Record<string, () => Promise<unknown>> = {};

/** Lazy page whose code can also be fetched ahead of navigation */
function lazyPage(route: string, load: () => Promise<ComponentType>): ComponentType {
  let pending: Promise<ComponentType> | undefined;
  const fetch = () => {
    pending ??= load().catch((error: unknown) => {
      // Let a later attempt retry after a failed chunk download
      pending = undefined;
      throw error;
    });
    return pending;
  };
  preloaders[route] = fetch;
  return lazy(() => fetch().then((component) => ({ default: component })));
}

/** Start downloading a page's code, e.g. when its navigation item is hovered */
export function preloadRoute(route: string): void {
  void preloaders[route]?.().catch(() => undefined);
}

const AnalyticsPage = lazyPage("glaze.analytics/analytics", () =>
  import("@glaze/plugin-analytics").then((module) => module.AnalyticsPage),
);
const CommentsPage = lazyPage("glaze.community/comments", () =>
  import("@glaze/plugin-community").then((module) => module.CommentsPage),
);
const FeedbackPage = lazyPage("glaze.community/feedback", () =>
  import("@glaze/plugin-community").then((module) => module.FeedbackPage),
);
const IncomePage = lazyPage("glaze.income/income", () =>
  import("@glaze/plugin-income").then((module) => module.IncomePage),
);
const PromotionPage = lazyPage("glaze.promotion/promotion", () =>
  import("@glaze/plugin-promotion").then((module) => module.PromotionPage),
);
const MessagesPage = lazyPage("glaze.messages/messages", () =>
  import("@glaze/plugin-messages").then((module) => module.MessagesPage),
);
const WorksPage = lazyPage("glaze.works/works", () => import("@glaze/plugin-works").then((module) => module.WorksPage));

/** Show the loading hint only when page code takes noticeably long, avoiding a flash on fast loads */
function PageFallback() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, []);
  return visible ? <EmptyState title="正在加载页面…" /> : null;
}

// The host registry decides availability; optional code is loaded only when enabled
const pages: Record<string, ComponentType> = {
  "glaze.home/home": HomePage,
  "glaze.works/works": WorksPage,
  "glaze.analytics/analytics": AnalyticsPage,
  "glaze.income/income": IncomePage,
  "glaze.promotion/promotion": PromotionPage,
  "glaze.community/feedback": FeedbackPage,
  "glaze.community/comments": CommentsPage,
  "glaze.messages/messages": MessagesPage,
  "glaze.assistant/assistant": AssistantPage,
  "glaze.settings/settings": Settings,
  "glaze.account/account": AccountPage,
  "glaze.account/login": LoginPage,
  "glaze.account/login-expired": LoginExpiredPage,
};

/** Connect settings to persisted host appearance and save feedback */
function Settings() {
  const { appearance, setAppearance, saving, status, themePreviewStyles } = useAppearance();
  return (
    <SettingsPage
      appearance={appearance}
      onAppearanceChange={setAppearance}
      appearanceSaving={saving}
      appearanceStatus={status}
      themePreviewStyles={themePreviewStyles}
    />
  );
}

/** Render the page registered for a route, or a placeholder when it is not built yet */
export function RouteView({ route, title }: { route: string; title: string }) {
  const registry = usePluginRegistry();
  if (registry?.snapshot && !registry.snapshot.plugins.find((plugin) => plugin.id === route.split("/")[0])?.enabled)
    return <EmptyState title="此插件已停用" hint="可在设置的插件页重新启用" />;
  const Page = pages[route];
  return Page ? (
    <PageBoundary key={route}>
      <Suspense fallback={<PageFallback />}>
        <Page />
      </Suspense>
    </PageBoundary>
  ) : (
    <PagePlaceholder title={title} />
  );
}
