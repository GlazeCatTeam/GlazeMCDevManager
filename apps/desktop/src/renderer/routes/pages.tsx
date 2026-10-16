import { AccountPage, LoginExpiredPage, LoginPage } from "@glaze/plugin-account";
import { HomePage } from "@glaze/plugin-home";
import { EmptyState, usePluginRegistry } from "@glaze/plugin-sdk";
import { SettingsPage } from "@glaze/plugin-settings";
import { type ComponentType, lazy, Suspense } from "react";
import { useAppearance } from "../shell/Appearance";
import { PageBoundary } from "./PageBoundary";
import { PagePlaceholder } from "./PagePlaceholder";

const AnalyticsPage = lazy(() =>
  import("@glaze/plugin-analytics").then((module) => ({ default: module.AnalyticsPage })),
);
const CommentsPage = lazy(() => import("@glaze/plugin-community").then((module) => ({ default: module.CommentsPage })));
const FeedbackPage = lazy(() => import("@glaze/plugin-community").then((module) => ({ default: module.FeedbackPage })));
const IncomePage = lazy(() => import("@glaze/plugin-income").then((module) => ({ default: module.IncomePage })));
const PromotionPage = lazy(() =>
  import("@glaze/plugin-promotion").then((module) => ({ default: module.PromotionPage })),
);
const MessagesPage = lazy(() => import("@glaze/plugin-messages").then((module) => ({ default: module.MessagesPage })));
const WorksPage = lazy(() => import("@glaze/plugin-works").then((module) => ({ default: module.WorksPage })));

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
      <Suspense fallback={<EmptyState title="正在加载页面…" />}>
        <Page />
      </Suspense>
    </PageBoundary>
  ) : (
    <PagePlaceholder title={title} />
  );
}
