import { SegmentedControl, Switch } from "@glaze/plugin-sdk";
import { type NotificationSettings, notificationItems } from "../mock";
import { SettingGroup, SettingRow } from "../widgets/SettingRow";
import sections from "./Sections.module.css";

const intervals = [
  { value: 5, label: "5 分钟" },
  { value: 15, label: "15 分钟" },
  { value: 30, label: "30 分钟" },
] as const;

export interface NotificationsSectionProps {
  value: NotificationSettings;
  onChange: (value: NotificationSettings) => void;
}

/** Which events raise a desktop notification, and how often to check in the background */
export function NotificationsSection({ value, onChange }: NotificationsSectionProps) {
  return (
    <div className={sections.stack}>
      <SettingGroup title="通知类型">
        {notificationItems.map((item) => (
          <SettingRow key={item.key} title={item.label} description={item.description}>
            <Switch
              label={item.label}
              checked={value[item.key]}
              onChange={(checked) => onChange({ ...value, [item.key]: checked })}
            />
          </SettingRow>
        ))}
      </SettingGroup>
      <SettingGroup title="后台检查">
        <SettingRow title="检查间隔" description="应用运行期间检查新消息的频率">
          <SegmentedControl
            label="后台检查间隔"
            options={intervals}
            value={value.interval}
            onChange={(interval) => onChange({ ...value, interval })}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
