import { Button, Switch, Tag } from "@glaze/plugin-sdk";
import type { InstalledPlugin } from "../mock";
import { SettingGroup, SettingRow } from "../widgets/SettingRow";
import sections from "./Sections.module.css";

const groups = [
  { kind: "builtin", title: "内置插件", requiredLabel: "必需" },
  { kind: "theme", title: "主题包", requiredLabel: "内置" },
] as const;

export interface PluginsSectionProps {
  plugins: InstalledPlugin[];
  onToggle: (id: string, enabled: boolean) => void;
  onInstall: () => void;
}

/** Built-in plugins and theme packs; optional ones can be turned off */
export function PluginsSection({ plugins, onToggle, onInstall }: PluginsSectionProps) {
  return (
    <div className={sections.stack}>
      <div className={sections.toolbar}>
        <span className={sections.muted}>内置插件和主题包 · 状态预览</span>
        <Button size="xs" onClick={onInstall}>
          安装本地插件
        </Button>
      </div>
      {groups.map((group) => (
        <SettingGroup key={group.kind} title={group.title}>
          {plugins
            .filter((plugin) => plugin.kind === group.kind)
            .map((plugin) => (
              <SettingRow key={plugin.id} title={plugin.name} description={plugin.description}>
                {plugin.required ? (
                  <Tag>{group.requiredLabel}</Tag>
                ) : (
                  <Switch
                    label={`启用${plugin.name}`}
                    checked={plugin.enabled}
                    onChange={(enabled) => onToggle(plugin.id, enabled)}
                  />
                )}
              </SettingRow>
            ))}
        </SettingGroup>
      ))}
    </div>
  );
}
