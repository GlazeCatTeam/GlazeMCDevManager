import { callHost, PluginProvider } from "@glaze/plugin-sdk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./global.css";
import { AppearanceProvider } from "./shell/Appearance";
import { AppShell } from "./shell/AppShell";

// Error categories are reported without stack traces, payloads or credential-bearing messages
window.addEventListener("error", () => {
  void callHost("app.reportRendererError", { kind: "error" }).catch(() => {});
});
window.addEventListener("unhandledrejection", () => {
  void callHost("app.reportRendererError", { kind: "unhandled-rejection" }).catch(() => {});
});

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element");
}

createRoot(container).render(
  <StrictMode>
    <PluginProvider>
      <AppearanceProvider>
        <AppShell />
      </AppearanceProvider>
    </PluginProvider>
  </StrictMode>,
);
