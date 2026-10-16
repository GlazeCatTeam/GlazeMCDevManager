import { createRoot } from "react-dom/client";
import { NavigationProvider } from "../../packages/plugin-sdk/src";
import { applyTheme } from "../../packages/theme/src";
import { AiSection } from "../../plugins/settings/src/sections/AiSection";
import { McpDraftPage } from "../../plugins/works/src/McpDraftPage";
import oreUi from "../../themes/ore-ui/theme.json";
import "../../apps/desktop/src/renderer/global.css";

applyTheme(oreUi);
createRoot(document.getElementById("root") as HTMLElement).render(
  <NavigationProvider value={{ route: "glaze.settings/settings", params: {}, navigate: () => {} }}>
    <main style={{ maxWidth: 920, margin: "24px auto", padding: 24 }}>
      <h2>AI 接入 / MCP</h2>
      {location.search.includes("editor") ? <McpDraftPage id="draft-a" /> : <AiSection />}
    </main>
  </NavigationProvider>,
);
