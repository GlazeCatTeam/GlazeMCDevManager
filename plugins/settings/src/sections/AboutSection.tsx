import { AppLogo, Button, callHost, type ProjectLink, Tag, TextButton, useHostQuery } from "@glaze/plugin-sdk";
import { useState } from "react";
import { SettingGroup, SettingRow } from "../widgets/SettingRow";
import styles from "./AboutSection.module.css";
import { LicenseDialog } from "./LicenseDialog";
import sections from "./Sections.module.css";
import { UpdateGroup } from "./UpdateGroup";

export interface AboutSectionProps {
  /** Report native action and update results */
  onNotice: (message: string) => void;
}

/** App identity, update options and project links */
export function AboutSection({ onNotice }: AboutSectionProps) {
  const about = useHostQuery("app.getAbout");
  const [licensesOpen, setLicensesOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const info = about.data;

  /** Ask the host to open a fixed project link and report failures without navigating the app */
  const openLink = async (link: ProjectLink) => {
    if (opening) return;
    setOpening(true);
    onNotice("");
    try {
      const result = await callHost("app.openProjectLink", { link });
      if (!result.ok) throw new Error(result.error.message);
      onNotice("已在默认浏览器中打开链接。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "打开链接失败，请重试。");
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className={sections.stack}>
      <div className={styles.identity}>
        <AppLogo size={56} />
        <div>
          <h3 className={styles.name}>{info?.name ?? "Glaze MC Dev Manager"}</h3>
          <p className={sections.muted}>网易我的世界开发者管理工具</p>
          {info && (
            <Tag>
              v{info.version} · {info.packaged ? "打包版本" : "开发模式"}
            </Tag>
          )}
          {!info && !about.error && <p role="status">正在读取版本信息…</p>}
        </div>
      </div>
      {about.error && (
        <div role="alert" className={sections.toolbar}>
          <span>版本信息读取失败：{about.error.message}</span>
          <Button size="xs" disabled={about.loading} onClick={about.reload}>
            重试
          </Button>
        </div>
      )}
      {info && (
        <dl className={styles.environment} aria-label="运行环境">
          <div>
            <dt>系统与架构</dt>
            <dd>
              {info.platform === "win32" ? "Windows" : info.platform} · {info.arch}
            </dd>
          </div>
          <div>
            <dt>Electron</dt>
            <dd>{info.electron}</dd>
          </div>
          <div>
            <dt>Chromium</dt>
            <dd>{info.chromium}</dd>
          </div>
          <div>
            <dt>Node.js</dt>
            <dd>{info.node}</dd>
          </div>
        </dl>
      )}
      <UpdateGroup onOpenReleases={() => void openLink("releases")} onNotice={onNotice} />
      <SettingGroup title="项目与许可">
        <SettingRow title="项目主页" description="GlazeCatTeam / GlazeMCDevManager · 查看源码与开发进度">
          <TextButton disabled={opening} onClick={() => void openLink("homepage")}>
            查看主页
          </TextButton>
        </SettingRow>
        <SettingRow title="问题反馈" description="在 GitHub Issues 报告问题或提出改进建议">
          <TextButton disabled={opening} onClick={() => void openLink("feedback")}>
            提交反馈
          </TextButton>
        </SettingRow>
        <SettingRow title="开源许可" description="Apache-2.0 · 项目许可、第三方依赖与资源声明">
          <TextButton onClick={() => setLicensesOpen(true)}>查看许可</TextButton>
        </SettingRow>
        <SettingRow title="参考项目" description="MCDevManager · 仅参考行为与接口，不包含其源码">
          <TextButton disabled={opening} onClick={() => void openLink("reference")}>
            查看项目
          </TextButton>
        </SettingRow>
      </SettingGroup>
      {info && <p className={sections.muted}>{info.projectLicense.summary}</p>}
      {licensesOpen && <LicenseDialog onClose={() => setLicensesOpen(false)} />}
    </div>
  );
}
