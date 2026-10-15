import { Button, SegmentedControl, Switch } from "@glaze/plugin-sdk";
import type { GeneralSettings } from "../mock";
import { SettingGroup, SettingRow } from "../widgets/SettingRow";
import sections from "./Sections.module.css";

const startPages = [
  { value: "home", label: "首页" },
  { value: "works", label: "作品管理" },
  { value: "last", label: "上次页面" },
] as const;

const closeActions = [
  { value: "tray", label: "最小化到托盘" },
  { value: "quit", label: "退出应用" },
] as const;

export interface GeneralSectionProps {
  value: GeneralSettings;
  onChange: (value: GeneralSettings) => void;
  onOpenAccount: () => void;
  onClearCache: () => void;
}

/** Startup and window behavior, the account page entry and cache cleanup */
export function GeneralSection({ value, onChange, onOpenAccount, onClearCache }: GeneralSectionProps) {
  return (
    <div className={sections.stack}>
      <SettingGroup title="启动与窗口">
        <SettingRow title="开机自启" description="登录 Windows 后自动启动应用">
          <Switch
            label="开机自启"
            checked={value.launchAtLogin}
            onChange={(launchAtLogin) => onChange({ ...value, launchAtLogin })}
          />
        </SettingRow>
        <SettingRow title="启动后打开" description="有有效账号时默认显示的页面">
          <SegmentedControl
            label="启动后打开"
            options={startPages}
            value={value.startPage}
            onChange={(startPage) => onChange({ ...value, startPage })}
          />
        </SettingRow>
        <SettingRow title="关闭窗口时" description="点击窗口关闭按钮后的行为">
          <SegmentedControl
            label="关闭窗口时"
            options={closeActions}
            value={value.closeAction}
            onChange={(closeAction) => onChange({ ...value, closeAction })}
          />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="账号与数据">
        <SettingRow title="账号管理" description="添加、切换账号或管理登录会话">
          <Button size="xs" onClick={onOpenAccount}>
            前往管理
          </Button>
        </SettingRow>
        <SettingRow title="清除本地缓存" description="清理临时数据，保留账号与偏好设置">
          <Button size="xs" onClick={onClearCache}>
            清除缓存
          </Button>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
