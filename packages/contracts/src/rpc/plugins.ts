export interface ThemeDefinition {
  id: string;
  name: string;
  defaultVariant: "dark" | "light";
  tokens: { base: Record<string, string>; semantic: Record<string, string>; component: Record<string, string> };
  variants?: Record<string, Record<string, string>>;
}

export interface AvailableTheme {
  id: string;
  name: string;
  version: string;
  description: string;
  modes: ("dark" | "light")[];
  definition: ThemeDefinition;
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  required: boolean;
  enabled: boolean;
  kind: "builtin" | "theme";
  source: "bundled" | "local";
  error: string | null;
}

export interface PluginSnapshot {
  plugins: InstalledPlugin[];
  themes: AvailableTheme[];
}

export interface PluginInstallPreview {
  token: string;
  id: string;
  name: string;
  version: string;
  previousVersion: string | null;
  description: string;
}
