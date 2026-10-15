import type { AvailableTheme } from "@glaze/contracts";
import fluentDark from "@glaze/theme-fluent-dark/theme.json";
import oreUi from "@glaze/theme-ore-ui/theme.json";
import type { BuiltinPlugin } from "./registry";

// Bundled manifests are build inputs, so packaged apps do not depend on the source checkout
export const bundledPlugins = Object.values(
  import.meta.glob<BuiltinPlugin>("../../../../../plugins/*/glaze-plugin.json", { eager: true, import: "default" }),
);
export const bundledThemes: AvailableTheme[] = [
  {
    id: "ore-ui",
    version: oreUi.version,
    name: oreUi.name,
    description: "方块风格 · 内置主题",
    modes: ["dark", "light"],
    definition: { ...oreUi, defaultVariant: "dark" },
  },
  {
    id: "fluent-dark",
    version: fluentDark.version,
    name: fluentDark.name,
    description: "简约、柔和 · 内置主题",
    modes: ["dark"],
    definition: { ...fluentDark, defaultVariant: "dark" },
  },
];
