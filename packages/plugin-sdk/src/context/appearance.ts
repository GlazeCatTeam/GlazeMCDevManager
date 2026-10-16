import type { AppearanceSettings } from "@glaze/contracts";
import { type CSSProperties, createContext, useContext } from "react";

/** Host-owned appearance state; the shell applies themes, plugins only read and request changes */
export interface HostAppearance {
  appearance: AppearanceSettings;
  setAppearance: (value: AppearanceSettings) => Promise<void>;
  saving: boolean;
  status: string;
  /** Host-resolved theme tokens scoped to each theme thumbnail */
  themePreviewStyles: Record<string, CSSProperties>;
}

const Context = createContext<HostAppearance | null>(null);

/** Provided by the shell's appearance controller */
export const HostAppearanceProvider = Context.Provider;

/** Appearance state from the shell, or null in standalone previews */
export function useHostAppearance(): HostAppearance | null {
  return useContext(Context);
}
