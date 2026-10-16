import { definePlugin, useHostAppearance } from "@glaze/plugin-sdk";
import { SettingsPage } from "./SettingsPage";

export type { AppearanceSettings } from "@glaze/plugin-sdk";
export { SettingsPage };

/** Settings page bound to the shell's appearance controller */
function SettingsRoute() {
  const host = useHostAppearance();
  return (
    <SettingsPage
      appearance={host?.appearance}
      onAppearanceChange={host?.setAppearance}
      appearanceSaving={host?.saving}
      appearanceStatus={host?.status}
      themePreviewStyles={host?.themePreviewStyles}
    />
  );
}

export default definePlugin({ pages: { settings: SettingsRoute } });
