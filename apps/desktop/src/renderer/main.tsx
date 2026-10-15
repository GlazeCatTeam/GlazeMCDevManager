import { applyTheme } from "@glaze/theme";
import oreUi from "@glaze/theme-ore-ui/theme.json";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import { AppearanceProvider } from "./shell/Appearance";
import { AppShell } from "./shell/AppShell";

applyTheme(oreUi);

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element");
}

createRoot(container).render(
  <StrictMode>
    <AppearanceProvider>
      <AppShell />
    </AppearanceProvider>
  </StrictMode>,
);
