import { definePlugin } from "@glaze/plugin-sdk";
import { PromotionPage } from "./PromotionPage";

export { PromotionPage };

export default definePlugin({ pages: { promotion: PromotionPage } });
