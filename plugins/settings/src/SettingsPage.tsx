import { Button, callHost, Dialog, PageHeader, Panel, useNavigation } from "@glaze/plugin-sdk";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import {
  type AppearanceSettings,
  categories,
  confirmationCopy,
  initialAppearance,
  initialGeneral,
  type PendingAction,
  type SettingsCategory,
} from "./mock";
import styles from "./SettingsPage.module.css";
import { AboutSection } from "./sections/AboutSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { GeneralSection } from "./sections/GeneralSection";
import { LogsSection } from "./sections/LogsSection";
import { PluginsSection } from "./sections/PluginsSection";
import { useGeneralSettings } from "./useGeneralSettings";

export interface SettingsPageProps {
  /** Host-owned appearance; without it the page keeps a local preview copy */
  appearance?: AppearanceSettings | undefined;
  onAppearanceChange?: ((value: AppearanceSettings) => void | Promise<void>) | undefined;
  appearanceSaving?: boolean | undefined;
  appearanceStatus?: string | undefined;
  /** Host-resolved theme tokens scoped to each thumbnail */
  themePreviewStyles?: Record<string, CSSProperties> | undefined;
}

/** Settings: category list on the left, one fixed-height content panel on the right */
export function SettingsPage({
  appearance,
  onAppearanceChange,
  appearanceSaving,
  appearanceStatus,
  themePreviewStyles,
}: SettingsPageProps) {
  const { navigate, params } = useNavigation();
  const [category, setCategory] = useState<SettingsCategory>("appearance");
  // AI connections moved to their own page; keep old links working
  useEffect(() => {
    if (params.category === "ai") navigate("glaze.assistant/assistant");
  }, [params.category, navigate]);
  const [localAppearance, setLocalAppearance] = useState(initialAppearance);
  const general = useGeneralSettings(category === "general");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState("");
  const [restoring, setRestoring] = useState(false);
  const selected = categories.find((item) => item.id === category) ?? categories[0];
  const closeDialog = useCallback(() => {
    if (!restoring) setPending(null);
  }, [restoring]);

  /** Switch category and drop the previous category's status note */
  const selectCategory = (value: SettingsCategory) => {
    setCategory(value);
    setNotice("");
  };

  /** Apply appearance through the host when it is connected, otherwise only preview it here */
  const changeAppearance = (value: AppearanceSettings) => {
    setLocalAppearance(value);
    void onAppearanceChange?.(value);
    setNotice(onAppearanceChange ? "" : "已更新外观选项，等待宿主接入主题预览。");
  };

  /** Restore persisted layouts or run the remaining preview actions */
  const confirmAction = async () => {
    if (!pending || restoring) {
      return;
    }
    if (pending.kind === "restore") {
      setRestoring(true);
      try {
        const result = await callHost("layout.reset");
        if (!result.ok) throw new Error(result.error.message);
        setNotice("已恢复默认排版，首页排行榜将显示默认榜单。外观设置保持不变。");
      } catch (error) {
        setNotice(`恢复排版失败：${error instanceof Error ? error.message : "请重试"}`);
      } finally {
        setRestoring(false);
      }
    } else if (pending.kind === "cache") {
      setRestoring(true);
      try {
        const result = await callHost("general.clearCache");
        if (!result.ok) throw new Error(result.error.message);
        setNotice(
          result.value.warnings.length
            ? `部分缓存已清理：${result.value.warnings.join("；")}`
            : "缓存已清理，后续访问会重新加载；账号、偏好设置和未保存的编辑内容已保留。",
        );
      } catch (error) {
        setNotice(`缓存清理失败：${error instanceof Error ? error.message : "请重试"}`);
      } finally {
        setRestoring(false);
      }
    }
    setPending(null);
  };

  return (
    <div className={styles.page}>
      <PageHeader title="设置" subtitle="修改全局设置，打造你的工作台" />

      <div className={styles.columns}>
        <nav className={styles.categories} aria-label="设置分类">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={category === item.id ? "page" : undefined}
              className={category === item.id ? `${styles.category} ${styles.active}` : styles.category}
              onClick={() => selectCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <Panel className={styles.content} aria-label={`${selected.label}设置`}>
          <div className={styles.contentHeading}>
            <h2>{selected.label}</h2>
            <span>{selected.description}</span>
          </div>
          <div key={category} className={styles.contentBody}>
            {category === "appearance" && (
              <AppearanceSection
                value={appearance ?? localAppearance}
                disabled={appearanceSaving || restoring}
                themePreviewStyles={themePreviewStyles}
                onChange={changeAppearance}
                onRestoreLayout={() => setPending({ kind: "restore" })}
              />
            )}
            {category === "general" && (
              <GeneralSection
                value={general.state?.settings ?? initialGeneral}
                disabled={general.busy || !general.state || restoring}
                launchAtLoginSupported={general.state?.launchAtLoginSupported ?? false}
                launchAtLoginWarning={general.state?.launchAtLoginWarning ?? null}
                readFailed={general.readFailed}
                onRetry={() => {
                  setNotice("");
                  general.reload();
                }}
                onChange={(value) => {
                  setNotice("");
                  void general.save(value);
                }}
                onOpenAccount={() => navigate("glaze.account/account")}
                onClearCache={() => setPending({ kind: "cache" })}
              />
            )}
            {category === "plugins" && <PluginsSection />}
            {category === "logs" && <LogsSection />}
            {category === "about" && (
              <AboutSection
                autoUpdate={autoUpdate}
                onAutoUpdateChange={(enabled) => {
                  setAutoUpdate(enabled);
                  setNotice("已更新自动检查选项，更新服务尚未接入。");
                }}
                onNotice={setNotice}
              />
            )}
          </div>
          <div className={styles.notice} role="status" aria-live="polite">
            {notice ||
              (category === "appearance" && onAppearanceChange
                ? appearanceStatus || "外观设置自动保存；恢复排版不会重置主题和缩放。"
                : category === "general"
                  ? general.status || "通用设置自动保存；启动页面在下次启动时生效。"
                  : category === "plugins"
                    ? "插件启停自动保存；本地安装支持无代码主题包。"
                    : category === "logs"
                      ? "运行日志自动记录并脱敏，可导出当前级别的最近 500 条。"
                      : category === "about"
                        ? "项目链接通过默认浏览器打开；依赖许可支持离线查看。"
                        : "界面预览 · 系统功能与业务服务尚待接入")}
          </div>
        </Panel>
      </div>

      {pending && (
        <Dialog
          title={confirmationCopy[pending.kind].title}
          onClose={closeDialog}
          actions={
            <>
              <Button onClick={closeDialog} disabled={restoring}>
                取消
              </Button>
              <Button
                variant={pending.kind === "restore" ? "primary" : "danger"}
                onClick={confirmAction}
                disabled={restoring}
              >
                {restoring
                  ? pending.kind === "cache"
                    ? "正在清理…"
                    : "正在恢复…"
                  : confirmationCopy[pending.kind].action}
              </Button>
            </>
          }
        >
          {confirmationCopy[pending.kind].body}
        </Dialog>
      )}
    </div>
  );
}
