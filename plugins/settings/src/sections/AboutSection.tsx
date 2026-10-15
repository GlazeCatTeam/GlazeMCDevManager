import { AppLogo, Button, Switch, Tag, TextButton } from "@glaze/plugin-sdk";
import { SettingGroup, SettingRow } from "../widgets/SettingRow";
import styles from "./AboutSection.module.css";
import sections from "./Sections.module.css";

// Link rows; addresses are not configured yet, so each reports why it does nothing
const links = [
  { title: "项目主页", description: "查看项目源码和开发进度", action: "查看主页", notice: "项目仓库地址尚未配置。" },
  { title: "问题反馈", description: "报告问题或提出改进建议", action: "提交反馈", notice: "项目反馈地址尚未配置。" },
  {
    title: "开源许可",
    description: "第三方依赖与许可声明",
    action: "查看许可",
    notice: "依赖许可清单尚未生成，将在发布打包时提供。",
  },
  {
    title: "参考项目",
    description: "MCDevManager · 仅参考行为与接口",
    action: "查看项目",
    notice: "参考项目: https://github.com/BitterLemonn/MCDevManager。外部链接打开服务尚未接入。",
  },
];

export interface AboutSectionProps {
  autoUpdate: boolean;
  onAutoUpdateChange: (enabled: boolean) => void;
  /** Report an action that needs a service which is not connected yet */
  onUnavailable: (message: string) => void;
}

/** App identity, update options and project links */
export function AboutSection({ autoUpdate, onAutoUpdateChange, onUnavailable }: AboutSectionProps) {
  return (
    <div className={sections.stack}>
      <div className={styles.identity}>
        <AppLogo size={56} />
        <div>
          <h3 className={styles.name}>Glaze MC Dev Manager</h3>
          <p className={sections.muted}>网易我的世界开发者管理工具</p>
          <Tag>v0.0.0 · 开发预览版</Tag>
        </div>
      </div>
      <SettingGroup title="更新">
        <SettingRow title="当前版本" description="开发预览版，更新服务尚未接入">
          <Button size="xs" onClick={() => onUnavailable("更新服务尚未接入，暂时无法检查最新版本。")}>
            检查更新
          </Button>
        </SettingRow>
        <SettingRow title="自动检查更新" description="设置选项预览，尚未启动自动检查">
          <Switch label="自动检查更新" checked={autoUpdate} onChange={onAutoUpdateChange} />
        </SettingRow>
      </SettingGroup>
      <SettingGroup title="项目与许可">
        {links.map((link) => (
          <SettingRow key={link.title} title={link.title} description={link.description}>
            <TextButton onClick={() => onUnavailable(link.notice)}>{link.action}</TextButton>
          </SettingRow>
        ))}
      </SettingGroup>
    </div>
  );
}
