import { AccountPage, LoginExpiredPage, LoginPage } from "@glaze/plugin-account";
import { HomePage } from "@glaze/plugin-home";
import type { ComponentType } from "react";
import { PagePlaceholder } from "./PagePlaceholder";

// Temporary static page table until the plugin registry loads built-in plugins (M1)
const pages: Record<string, ComponentType> = {
  "glaze.home/home": HomePage,
  "glaze.account/account": AccountPage,
  "glaze.account/login": LoginPage,
  "glaze.account/login-expired": LoginExpiredPage,
};

/** Render the page registered for a route, or a placeholder when it is not built yet */
export function RouteView({ route, title }: { route: string; title: string }) {
  const Page = pages[route];
  return Page ? <Page /> : <PagePlaceholder title={title} />;
}
