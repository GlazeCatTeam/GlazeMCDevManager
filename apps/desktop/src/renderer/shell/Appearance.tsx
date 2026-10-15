import { type AppearanceSettings, callHost, defaultAppearance, onHostEvent } from "@glaze/plugin-sdk";
import { applyTheme } from "@glaze/theme";
import fluentDark from "@glaze/theme-fluent-dark/theme.json";
import oreUi from "@glaze/theme-ore-ui/theme.json";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface AppearanceContextValue {
  appearance: AppearanceSettings;
  setAppearance: (value: AppearanceSettings) => Promise<void>;
  saving: boolean;
  status: string;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/** Theme variant to apply; Fluent only ships a dark variant, "system" follows the OS */
function resolveVariant(appearance: AppearanceSettings, systemDark: boolean): "dark" | "light" {
  if (appearance.themeId === "fluent-dark") {
    return "dark";
  }
  if (appearance.colorMode === "system") {
    return systemDark ? "dark" : "light";
  }
  return appearance.colorMode;
}

/** Load preferences before showing pages and apply only successfully saved changes */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceSettings>({ ...defaultAppearance });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const writing = useRef(false);

  useEffect(() => {
    let active = true;
    let changed = false;
    const unsubscribe = onHostEvent("appearance.changed", (value) => {
      changed = true;
      setAppearance(value);
    });
    void callHost("appearance.get")
      .then((result) => {
        if (!active || changed) return;
        if (result.ok) setAppearance(result.value);
        else setStatus(`外观读取失败，暂用默认值：${result.error.message}`);
      })
      .catch(() => {
        if (active && !changed) setStatus("外观读取失败，暂用默认值；重新选择外观可重试保存。");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    // Resolve system mode whenever the OS preference changes
    const update = () => {
      const theme = appearance.themeId === "fluent-dark" ? fluentDark : oreUi;
      const variant = resolveVariant(appearance, media.matches);
      applyTheme(theme, variant);
      document.documentElement.style.zoom = String(appearance.scale / 100);
      document.documentElement.style.colorScheme = variant;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [appearance]);

  /** Serialize writes and keep the last saved appearance when persistence fails */
  const save = useCallback(async (next: AppearanceSettings) => {
    if (writing.current) return;
    writing.current = true;
    setSaving(true);
    setStatus("正在保存外观…");
    try {
      const result = await callHost("appearance.set", next);
      if (!result.ok) throw new Error(result.error.message);
      setAppearance(result.value);
      setStatus("外观已应用并保存，重启后仍然有效。");
    } catch (error) {
      setStatus(`外观保存失败，已保留原设置：${error instanceof Error ? error.message : "请重试"}`);
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }, []);

  const value = useMemo(
    () => ({ appearance, setAppearance: save, saving, status }),
    [appearance, save, saving, status],
  );
  return <AppearanceContext.Provider value={value}>{ready ? children : null}</AppearanceContext.Provider>;
}

/** Access host-owned appearance state without coupling plugins to the theme engine */
export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) {
    throw new Error("AppearanceProvider is required");
  }
  return value;
}
