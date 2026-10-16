import { createRoot } from "react-dom/client";
import { NavigationProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { AccessRequestDialog, AssistantPage } from "../../plugins/assistant/src";
import oreUi from "../../themes/ore-ui/theme.json";
import { installMcpMock } from "./mcp-mock";
import "../../apps/desktop/src/renderer/global.css";

// UI tests inject their own bridge; a plain browser preview falls back to the in-page mock
if (!("glaze" in globalThis)) installMcpMock();
applyTheme(oreUi);
createRoot(document.getElementById("root") as HTMLElement).render(
  <NavigationProvider value={{ route: "glaze.assistant/assistant", params: {}, navigate: () => {} }}>
    <AssistantPage />
    <AccessRequestDialog />
  </NavigationProvider>,
);
