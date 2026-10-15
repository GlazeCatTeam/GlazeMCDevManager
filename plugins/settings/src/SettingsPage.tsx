import { Button, Dialog, PageHeader, Panel, useNavigation } from "@glaze/plugin-sdk";
import { useCallback, useState } from "react";
import {
  type AppearanceSettings,
  categories,
  confirmationCopy,
  type GeneralSettings,
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

// Result notes for confirmed actions whose services are not connected yet
const pendingNotices = {
  cache: "缓存清理服务尚未接入，未删除本地文件。",
  restore: "布局服务尚未接入，当前页面保持默认排版。",
};

export interface SettingsPageProps {
  /** Host-owned appearance; without it the page keeps a local preview copy */
  appearance?: AppearanceSettings | undefined;
  onAppearanceChange?: ((value: AppearanceSettings) => void) | undefined;
}

/** Settings: category list on the left, one fixed-height content panel on the right */
export function SettingsPage({ appearance, onAppearanceChange }: SettingsPageProps) {
  const { navigate } = useNavigation();
  const [category, setCategory] = useState<SettingsCategory>("appearance");
  const [localAppearance, setLocalAppearance] = useState(initialAppearance);
  const [general, setGeneral] = useState(initialGeneral);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [clients, setClients] = useState(initialClients);
  const [logs, setLogs] = useState(initialLogs);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState("");
  const selected = categories.find((item) => item.id === category) ?? categories[0];
  const closeDialog = useCallback(() => setPending(null), []);

  /** Switch category and drop the previous category's status note */
  const selectCategory = (value: SettingsCategory) => {
    setCategory(value);
    setNotice("");
  };

  /** Apply appearance through the host when it is connected, otherwise only preview it here */
  const changeAppearance = (value: AppearanceSettings) => {
    setLocalAppearance(value);
    onAppearanceChange?.(value);
    setNotice(onAppearanceChange ? "已应用外观，本次应用会话内有效。" : "已更新外观选项，等待宿主接入主题预览。");
  };

  /** Preview a general preference without touching operating-system settings */
  const changeGeneral = (value: GeneralSettings) => {
    setGeneral(value);
    setNotice("已更新本页预览选项，启动与窗口行为待主进程接入。");
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

  /** Run the confirmed action and say plainly what did not happen */
  const confirmAction = () => {
    if (!pending) {
      return;
    }
    if (pending.kind === "revoke") {
      setClients((items) => items.filter((client) => client.id !== pending.client.id));
      setNotice(`已移除模拟客户端「${pending.client.name}」。真实授权服务尚未接入。`);
    } else if (pending.kind === "clearLogs") {
      setLogs([]);
      setNotice("本页模拟日志已清空，未修改本地日志文件。");
    } else {
      setNotice(pendingNotices[pending.kind]);
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
                onChange={changeAppearance}
                onRestoreLayout={() => setPending({ kind: "restore" })}
              />
            )}
            {category === "general" && (
              <GeneralSection
                value={general}
                onChange={changeGeneral}
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
            {notice || "界面预览 · 系统功能与业务服务尚待接入"}
          </div>
        </Panel>
      </div>

      {pending && (
        <Dialog
          title={confirmationCopy[pending.kind].title}
          onClose={closeDialog}
          actions={
            <>
              <Button onClick={closeDialog}>取消</Button>
              <Button variant={pending.kind === "restore" ? "primary" : "danger"} onClick={confirmAction}>
                {confirmationCopy[pending.kind].action}
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
