import { definePlugin } from "@glaze/plugin-sdk";
import { AnalyticsPage } from "./AnalyticsPage";
import { topSellers } from "./tools";

export { AnalyticsPage };

export default definePlugin({ pages: { analytics: AnalyticsPage }, tools: { top_sellers: topSellers } });
