import type { AppearanceSettings } from "@glaze/plugin-settings";
import { applyTheme } from "@glaze/theme";
import fluentDark from "@glaze/theme-fluent-dark/theme.json";
import oreUi from "@glaze/theme-ore-ui/theme.json";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

interface AppearanceContextValue {
  appearance: AppearanceSettings;
  setAppearance: (value: AppearanceSettings) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/** Apply session-only appearance preferences across page navigation */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceSettings>({
    themeId: "ore-ui",
    colorMode: "dark",
    scale: 100,
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    // Resolve system mode whenever the OS preference changes
    const update = () => {
      const theme = appearance.themeId === "fluent-dark" ? fluentDark : oreUi;
      const variant =
        appearance.themeId === "fluent-dark"
          ? "dark"
          : appearance.colorMode === "system"
            ? media.matches
              ? "dark"
              : "light"
            : appearance.colorMode;
      applyTheme(theme, variant);
      document.documentElement.style.zoom = String(appearance.scale / 100);
      document.documentElement.style.colorScheme = variant;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [appearance]);

  const value = useMemo(() => ({ appearance, setAppearance }), [appearance]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/** Access host-owned appearance state without coupling plugins to the theme engine */
export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) {
    throw new Error("AppearanceProvider is required");
  }
  return value;
}
