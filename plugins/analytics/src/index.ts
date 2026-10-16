import { definePlugin, useNavigation, useSession } from "@glaze/plugin-sdk";
import { createElement } from "react";
import { AnalyticsPage } from "./AnalyticsPage";
import { topSellers } from "./tools";

export { AnalyticsPage };

/** Open a work's analysis only in the account that supplied the navigation request */
function AnalyticsRoute() {
  const { params } = useNavigation();
  const { current } = useSession();
  const initialResourceId = params.account === current?.id ? params.resourceId : undefined;
  return createElement(AnalyticsPage, { initialResourceId });
}

export default definePlugin({ pages: { analytics: AnalyticsRoute }, tools: { top_sellers: topSellers } });
