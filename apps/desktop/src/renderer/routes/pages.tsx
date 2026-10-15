import { AccountPage, LoginExpiredPage, LoginPage } from "@glaze/plugin-account";
import { AnalyticsPage } from "@glaze/plugin-analytics";
import { CommentsPage, FeedbackPage } from "@glaze/plugin-community";
import { HomePage } from "@glaze/plugin-home";
import { MessagesPage } from "@glaze/plugin-messages";
import { SettingsPage } from "@glaze/plugin-settings";
import { WorksPage } from "@glaze/plugin-works";
import type { ComponentType } from "react";
import { useAppearance } from "../shell/Appearance";
import { PagePlaceholder } from "./PagePlaceholder";

// Temporary static page table until the plugin registry loads built-in plugins (M1)
const pages: Record<string, ComponentType> = {
  "glaze.home/home": HomePage,
  "glaze.works/works": WorksPage,
  "glaze.analytics/analytics": AnalyticsPage,
  "glaze.community/feedback": FeedbackPage,
  "glaze.community/comments": CommentsPage,
  "glaze.messages/messages": MessagesPage,
  "glaze.settings/settings": SettingsPreview,
  "glaze.account/account": AccountPage,
  "glaze.account/login": LoginPage,
  "glaze.account/login-expired": LoginExpiredPage,
};

/** Connect the settings preview to the host's existing theme engine */
function SettingsPreview() {
  const { appearance, setAppearance } = useAppearance();
  return <SettingsPage appearance={appearance} onAppearanceChange={setAppearance} />;
}

/** Render the page registered for a route, or a placeholder when it is not built yet */
export function RouteView({ route, title }: { route: string; title: string }) {
  const Page = pages[route];
  return Page ? <Page /> : <PagePlaceholder title={title} />;
}
