import { Button, callHost, Dialog, PageHeader, Panel, useNavigation } from "@glaze/plugin-sdk";
import { useCallback, useState } from "react";
import {
  type AppearanceSettings,
  categories,
  confirmationCopy,
  initialAppearance,
  initialClients,
  initialGeneral,
  initialLogs,
  initialNotifications,
  initialPlugins,
  type NotificationSettings,
  type PendingAction,
  type SettingsCategory,
} from "./mock";
import styles from "./SettingsPage.module.css";
import { AboutSection } from "./sections/AboutSection";
import { AiSection } from "./sections/AiSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { GeneralSection } from "./sections/GeneralSection";
import { LogsSection } from "./sections/LogsSection";
import { NotificationsSection } from "./sections/NotificationsSection";
import { PluginsSection } from "./sections/PluginsSection";
import { useGeneralSettings } from "./useGeneralSettings";

export interface SettingsPageProps {
  /** Host-owned appearance; without it the page keeps a local preview copy */
  appearance?: AppearanceSettings | undefined;
  onAppearanceChange?: ((value: AppearanceSettings) => void | Promise<void>) | undefined;
  appearanceSaving?: boolean | undefined;
  appearanceStatus?: string | undefined;
}

/** Settings: category list on the left, one fixed-height content panel on the right */
export function SettingsPage({
  appearance,
  onAppearanceChange,
  appearanceSaving,
  appearanceStatus,
}: SettingsPageProps) {
  const { navigate } = useNavigation();
  const [category, setCategory] = useState<SettingsCategory>("appearance");
  const [localAppearance, setLocalAppearance] = useState(initialAppearance);
  const general = useGeneralSettings(category === "general");
  const [notifications, setNotifications] = useState(initialNotifications);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [clients, setClients] = useState(initialClients);
  const [logs, setLogs] = useState(initialLogs);
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

  /** Preview notification options without scheduling background checks */
  const changeNotifications = (value: NotificationSettings) => {
    setNotifications(value);
    setNotice("已更新本页通知选项，实际通知与后台检查待服务接入。");
  };

  /** Preview an optional plugin's enabled state without unloading its code */
  const togglePlugin = (id: string, enabled: boolean) => {
    setPlugins((items) => items.map((item) => (item.id === id && !item.required ? { ...item, enabled } : item)));
    setNotice("已更新插件状态预览，实际启停待插件管理器接入。");
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
    } else if (pending.kind === "revoke") {
      setClients((items) => items.filter((client) => client.id !== pending.client.id));
      setNotice(`已移除模拟客户端「${pending.client.name}」。真实授权服务尚未接入。`);
    } else if (pending.kind === "clearLogs") {
      setLogs([]);
      setNotice("本页模拟日志已清空，未修改本地日志文件。");
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
            {category === "notifications" && (
              <NotificationsSection value={notifications} onChange={changeNotifications} />
            )}
            {category === "plugins" && (
              <PluginsSection
                plugins={plugins}
                onToggle={togglePlugin}
                onInstall={() => setNotice("本地插件安装需由主进程校验权限与加载文件，安装服务尚未接入。")}
              />
            )}
            {category === "ai" && (
              <AiSection
                clients={clients}
                onRevoke={(client) => setPending({ kind: "revoke", client })}
                onUnavailable={setNotice}
              />
            )}
            {category === "logs" && (
              <LogsSection
                logs={logs}
                onRefresh={() => {
                  setLogs(initialLogs);
                  setNotice("已重新加载模拟日志。");
                }}
                onClear={() => setPending({ kind: "clearLogs" })}
                onNotice={setNotice}
              />
            )}
            {category === "about" && (
              <AboutSection
                autoUpdate={autoUpdate}
                onAutoUpdateChange={(enabled) => {
                  setAutoUpdate(enabled);
                  setNotice("已更新自动检查选项，更新服务尚未接入。");
                }}
                onUnavailable={setNotice}
              />
            )}
          </div>
          <div className={styles.notice} role="status" aria-live="polite">
            {notice ||
              (category === "appearance" && onAppearanceChange
                ? appearanceStatus || "外观设置自动保存；恢复排版不会重置主题和缩放。"
                : category === "general"
                  ? general.status || "通用设置自动保存；启动页面在下次启动时生效。"
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
          {pending.kind === "revoke" && <p className={styles.dialogClient}>{pending.client.name}</p>}
          {confirmationCopy[pending.kind].body}
        </Dialog>
      )}
    </div>
  );
}
