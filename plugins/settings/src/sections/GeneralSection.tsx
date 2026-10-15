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
  disabled: boolean;
  launchAtLoginSupported: boolean;
  launchAtLoginWarning: string | null;
  readFailed: boolean;
  onRetry: () => void;
}

/** Startup and window behavior, the account page entry and cache cleanup */
export function GeneralSection({
  value,
  onChange,
  onOpenAccount,
  onClearCache,
  disabled,
  launchAtLoginSupported,
  launchAtLoginWarning,
  readFailed,
  onRetry,
}: GeneralSectionProps) {
  return (
    <div className={sections.stack}>
      {readFailed && <Button onClick={onRetry}>重新读取通用设置</Button>}
      <fieldset disabled={disabled} aria-label="启动与窗口选项" aria-busy={disabled} className={sections.controls}>
        <SettingGroup title="启动与窗口">
          <SettingRow title="开机自启" description={launchAtLoginWarning ?? "登录 Windows 后自动启动应用"}>
            <Switch
              label="开机自启"
              checked={value.launchAtLogin}
              disabled={!launchAtLoginSupported}
              onChange={(launchAtLogin) => onChange({ ...value, launchAtLogin })}
            />
          </SettingRow>
          <SettingRow title="启动后打开" description="有有效登录会话时生效；上次页面仅恢复页面入口，不恢复编辑草稿">
            <SegmentedControl
              label="启动后打开"
              options={startPages}
              value={value.startPage}
              onChange={(startPage) => onChange({ ...value, startPage })}
            />
          </SettingRow>
          <SettingRow title="关闭窗口时" description="托盘模式可点击托盘图标恢复窗口，或通过托盘菜单退出">
            <SegmentedControl
              label="关闭窗口时"
              options={closeActions}
              value={value.closeAction}
              onChange={(closeAction) => onChange({ ...value, closeAction })}
            />
          </SettingRow>
        </SettingGroup>
      </fieldset>
      <SettingGroup title="账号与数据">
        <SettingRow title="账号管理" description="添加、切换账号或管理登录会话">
          <Button size="xs" onClick={onOpenAccount}>
            前往管理
          </Button>
        </SettingRow>
        <SettingRow title="清除本地缓存" description="清理资源、图片和查询缓存，保留账号与偏好设置">
          <Button size="xs" onClick={onClearCache} disabled={disabled}>
            清除缓存
          </Button>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
