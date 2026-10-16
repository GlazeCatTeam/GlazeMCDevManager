import { definePlugin } from "@glaze/plugin-sdk";
import { AssistantPage } from "./AssistantPage";
import { AiServiceSection } from "./sections/AiServiceSection";
import { StatusWidget } from "./widgets/StatusWidget";

export { AssistantPage };

export default definePlugin({
  pages: { assistant: AssistantPage },
  settingsSections: { "ai-service": AiServiceSection },
  homeWidgets: { status: StatusWidget },
});
