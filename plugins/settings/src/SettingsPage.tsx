import { AppLogo, Button, Dialog, Panel, Switch, Tag, TextButton, useNavigation } from "@glaze/plugin-sdk";
import { useCallback, useState } from "react";
import { AppearanceContent } from "./AppearanceContent";
import { ChoiceGroup, SettingRow } from "./controls";
import { exportLogs, filterLogs } from "./helpers";
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
  type LogLevel,
  logLevelLabels,
  type NotificationSettings,
  notificationItems,
  type PendingAction,
  type SettingsCategory,
} from "./mock";
import styles from "./SettingsPage.module.css";

interface SettingsPageProps {
  appearance?: AppearanceSettings;
  onAppearanceChange?: (value: AppearanceSettings) => void;
}

/** Seven fixed-height settings panels backed by explicit session-only preview data */
export function SettingsPage({ appearance, onAppearanceChange }: SettingsPageProps) {
  const { navigate } = useNavigation();
  const [category, setCategory] = useState<SettingsCategory>("appearance");
  const [localAppearance, setLocalAppearance] = useState(initialAppearance);
  const [general, setGeneral] = useState(initialGeneral);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [plugins, setPlugins] = useState(initialPlugins);
  const [clients, setClients] = useState(initialClients);
  const [logs, setLogs] = useState(initialLogs);
  const [logLevel, setLogLevel] = useState<LogLevel | "all">("all");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState("");
  const currentAppearance = appearance ?? localAppearance;
  const selected = categories.find((item) => item.id === category) ?? categories[0];
  const visibleLogs = filterLogs(logs, logLevel);
  const closeDialog = useCallback(() => setPending(null), []);

  /** Select a category without leaking the previous panel's action feedback */
  function selectCategory(value: SettingsCategory) {
    setCategory(value);
    setNotice("");
  }

  /** Delegate visual changes to the host while keeping standalone preview state usable */
  function changeAppearance(value: AppearanceSettings) {
    setLocalAppearance(value);
    onAppearanceChange?.(value);
    setNotice(onAppearanceChange ? "已应用外观，本次应用会话内有效。" : "已更新外观选项，等待宿主接入主题预览。");
  }

  /** Preview a general preference without changing operating-system settings */
  function changeGeneral(value: GeneralSettings) {
    setGeneral(value);
    setNotice("已更新本页预览选项，启动与窗口行为待主进程接入。");
  }

  /** Preview reminder options without scheduling background checks */
  function changeNotifications(value: NotificationSettings) {
    setNotifications(value);
    setNotice("已更新本页通知选项，实际通知与后台检查待服务接入。");
  }

  /** Preview an optional plugin's enabled state without unloading application code */
  function togglePlugin(id: string, enabled: boolean) {
    setPlugins((items) => items.map((item) => (item.id === id && !item.required ? { ...item, enabled } : item)));
    setNotice("已更新插件状态预览，实际启停待插件管理器接入。");
  }

  /** Complete confirmed mock actions and report unavailable services accurately */
  function confirmAction() {
    if (!pending) return;
    if (pending.kind === "revoke") {
      setClients((items) => items.filter((client) => client.id !== pending.client.id));
      setNotice(`已移除模拟客户端「${pending.client.name}」。真实授权服务尚未接入。`);
    } else if (pending.kind === "clearLogs") {
      setLogs([]);
      setNotice("本页模拟日志已清空，未修改本地日志文件。");
    } else {
      setNotice(
        pending.kind === "cache"
          ? "缓存清理服务尚未接入，未删除本地文件。"
          : "布局服务尚未接入，当前页面保持默认排版。",
      );
    }
    setPending(null);
  }

  /** Restore the sample log dataset for repeatable filtering and export previews */
  function refreshLogs() {
    setLogs(initialLogs);
    setNotice("已重新加载模拟日志。");
  }

  /** Export only the visible sample records and report download failures */
  function downloadLogs() {
    try {
      exportLogs(visibleLogs);
      setNotice(`已生成 ${visibleLogs.length} 条模拟日志的下载文件。`);
    } catch {
      setNotice("模拟日志导出失败，请重试。");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1 className={styles.title}>设置</h1>
        <span className={styles.subtitle}>修改全局设置，打造你的工作台</span>
      </div>

      <div className={styles.columns}>
        <nav className={styles.navigation} aria-label="设置分类">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={category === item.id ? "page" : undefined}
              className={`${styles.category} ${category === item.id ? styles.categoryActive : ""}`}
              onClick={() => selectCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <Panel className={styles.content} aria-label={`${selected.label}设置`}>
          <div className={styles.contentHeading}>
            <h2 className={styles.contentTitle}>{selected.label}</h2>
            <span className={styles.muted}>{selected.description}</span>
          </div>
          <div key={category} className={styles.contentBody}>
            {category === "appearance" && (
              <AppearanceContent
                value={currentAppearance}
                onChange={changeAppearance}
                onRestore={() => setPending({ kind: "restore" })}
              />
            )}

            {category === "general" && (
              <div className={styles.sections}>
                <section className={styles.section} aria-label="启动与窗口">
                  <h3 className={styles.sectionTitle}>启动与窗口</h3>
                  <SettingRow title="开机自启" description="登录 Windows 后自动启动应用">
                    <Switch
                      label="开机自启"
                      checked={general.launchAtLogin}
                      onChange={(launchAtLogin) => changeGeneral({ ...general, launchAtLogin })}
                    />
                  </SettingRow>
                  <SettingRow title="启动后打开" description="有有效账号时默认显示的页面">
                    <ChoiceGroup<GeneralSettings["startPage"]>
                      label="启动后打开"
                      value={general.startPage}
                      choices={[
                        { value: "home", label: "首页" },
                        { value: "works", label: "作品管理" },
                        { value: "last", label: "上次页面" },
                      ]}
                      onChange={(startPage) => changeGeneral({ ...general, startPage })}
                    />
                  </SettingRow>
                  <SettingRow title="关闭窗口时" description="点击窗口关闭按钮后的行为">
                    <ChoiceGroup<GeneralSettings["closeAction"]>
                      label="关闭窗口时"
                      value={general.closeAction}
                      choices={[
                        { value: "tray", label: "最小化到托盘" },
                        { value: "quit", label: "退出应用" },
                      ]}
                      onChange={(closeAction) => changeGeneral({ ...general, closeAction })}
                    />
                  </SettingRow>
                </section>
                <section className={styles.section} aria-label="账号与数据">
                  <h3 className={styles.sectionTitle}>账号与数据</h3>
                  <SettingRow title="账号管理" description="添加、切换账号或管理登录会话">
                    <Button size="xs" onClick={() => navigate("glaze.account/account")}>
                      前往管理
                    </Button>
                  </SettingRow>
                  <SettingRow title="清除本地缓存" description="清理临时数据，保留账号与偏好设置">
                    <Button size="xs" onClick={() => setPending({ kind: "cache" })}>
                      清除缓存
                    </Button>
                  </SettingRow>
                </section>
              </div>
            )}

            {category === "notifications" && (
              <div className={styles.sections}>
                <section className={styles.section} aria-label="通知类型">
                  <h3 className={styles.sectionTitle}>通知类型</h3>
                  {notificationItems.map((item) => (
                    <SettingRow key={item.key} title={item.label} description={item.description}>
                      <Switch
                        label={item.label}
                        checked={notifications[item.key]}
                        onChange={(checked) => changeNotifications({ ...notifications, [item.key]: checked })}
                      />
                    </SettingRow>
                  ))}
                </section>
                <section className={styles.section} aria-label="后台检查">
                  <h3 className={styles.sectionTitle}>后台检查</h3>
                  <SettingRow title="检查间隔" description="应用运行期间检查新消息的频率">
                    <ChoiceGroup<NotificationSettings["interval"]>
                      label="后台检查间隔"
                      value={notifications.interval}
                      choices={[
                        { value: 5, label: "5 分钟" },
                        { value: 15, label: "15 分钟" },
                        { value: 30, label: "30 分钟" },
                      ]}
                      onChange={(interval) => changeNotifications({ ...notifications, interval })}
                    />
                  </SettingRow>
                </section>
              </div>
            )}

            {category === "plugins" && (
              <div className={styles.sections}>
                <div className={styles.toolbar}>
                  <span className={styles.muted}>内置插件和主题包 · 状态预览</span>
                  <Button
                    size="xs"
                    onClick={() => setNotice("本地插件安装需由主进程校验权限与加载文件，安装服务尚未接入。")}
                  >
                    安装本地插件
                  </Button>
                </div>
                {(["builtin", "theme"] as const).map((kind) => (
                  <section
                    className={styles.section}
                    key={kind}
                    aria-label={kind === "builtin" ? "内置插件" : "主题包"}
                  >
                    <h3 className={styles.sectionTitle}>{kind === "builtin" ? "内置插件" : "主题包"}</h3>
                    {plugins
                      .filter((plugin) => plugin.kind === kind)
                      .map((plugin) => (
                        <SettingRow key={plugin.id} title={plugin.name} description={plugin.description}>
                          {plugin.required ? (
                            <Tag>{kind === "theme" ? "内置" : "必需"}</Tag>
                          ) : (
                            <Switch
                              label={`启用${plugin.name}`}
                              checked={plugin.enabled}
                              onChange={(enabled) => togglePlugin(plugin.id, enabled)}
                            />
                          )}
                        </SettingRow>
                      ))}
                  </section>
                ))}
              </div>
            )}

            {category === "ai" && (
              <div className={styles.sections}>
                <section className={styles.section} aria-label="MCP 服务">
                  <h3 className={styles.sectionTitle}>连接服务</h3>
                  <SettingRow title="MCP 服务" description="尚未接入主进程，当前未启动服务">
                    <Switch
                      label="MCP 服务"
                      checked={false}
                      onChange={() => setNotice("MCP 服务尚未实现，无法启动或生成有效配对码。下方客户端仅为模拟数据。")}
                    />
                  </SettingRow>
                  <SettingRow title="客户端配对" description="服务开启后生成一次性配对码">
                    <Button size="xs" onClick={() => setNotice("配对服务尚未接入，暂时无法生成配对码。")}>
                      生成配对码
                    </Button>
                  </SettingRow>
                </section>
                <section className={styles.section} aria-label="已配对客户端">
                  <h3 className={styles.sectionTitle}>
                    已配对客户端 <span className={styles.muted}>模拟数据 · {clients.length}</span>
                  </h3>
                  {clients.map((client) => (
                    <SettingRow
                      key={client.id}
                      title={client.name}
                      description={`最近连接 ${client.lastSeen} · 只读权限`}
                    >
                      <TextButton tone="danger" onClick={() => setPending({ kind: "revoke", client })}>
                        撤销授权
                      </TextButton>
                    </SettingRow>
                  ))}
                  {clients.length === 0 && <p className={styles.empty}>暂无已配对客户端</p>}
                </section>
                <section className={styles.permissionCard} aria-label="权限说明">
                  <h3 className={styles.settingTitle}>权限说明</h3>
                  <ul className={styles.permissionList}>
                    <li>默认只读，仅允许查询授权范围内的数据</li>
                    <li>写操作每次都需要在应用内确认</li>
                    <li>密码、Cookie 和登录凭据永不向 AI 工具开放</li>
                  </ul>
                </section>
              </div>
            )}

            {category === "logs" && (
              <div className={styles.sections}>
                <div className={styles.toolbar}>
                  <ChoiceGroup<LogLevel | "all">
                    label="日志级别"
                    value={logLevel}
                    choices={[
                      { value: "all", label: "全部" },
                      { value: "info", label: "信息" },
                      { value: "warn", label: "警告" },
                      { value: "error", label: "错误" },
                    ]}
                    onChange={setLogLevel}
                  />
                  <div className={styles.choices}>
                    <Button size="xs" onClick={refreshLogs}>
                      刷新
                    </Button>
                    <Button size="xs" disabled={visibleLogs.length === 0} onClick={downloadLogs}>
                      导出
                    </Button>
                  </div>
                </div>
                <section className={styles.logList} aria-label="模拟日志记录">
                  {visibleLogs.map((entry) => (
                    <div className={styles.logEntry} key={entry.id}>
                      <span className={styles.logTime}>{entry.time}</span>
                      <span className={`${styles.logLevel} ${styles[entry.level]}`}>{logLevelLabels[entry.level]}</span>
                      <span>{entry.message}</span>
                    </div>
                  ))}
                  {visibleLogs.length === 0 && <p className={styles.empty}>没有符合条件的模拟日志</p>}
                </section>
                <div className={styles.toolbar}>
                  <span className={styles.muted}>共 {visibleLogs.length} 条 · 模拟日志</span>
                  <div className={styles.choices}>
                    <Button size="xs" onClick={() => setNotice("日志目录需由主进程打开，文件服务尚未接入。")}>
                      打开文件夹
                    </Button>
                    <TextButton
                      tone="danger"
                      disabled={logs.length === 0}
                      onClick={() => setPending({ kind: "clearLogs" })}
                    >
                      清除日志
                    </TextButton>
                  </div>
                </div>
              </div>
            )}

            {category === "about" && (
              <div className={styles.sections}>
                <div className={styles.aboutIdentity}>
                  <AppLogo size={56} />
                  <div>
                    <h3 className={styles.appName}>Glaze MC Dev Manager</h3>
                    <p className={styles.muted}>网易我的世界开发者管理工具</p>
                    <Tag>v0.0.0 · 开发预览版</Tag>
                  </div>
                </div>
                <section className={styles.section} aria-label="应用更新">
                  <h3 className={styles.sectionTitle}>更新</h3>
                  <SettingRow title="当前版本" description="开发预览版，更新服务尚未接入">
                    <Button size="xs" onClick={() => setNotice("更新服务尚未接入，暂时无法检查最新版本。")}>
                      检查更新
                    </Button>
                  </SettingRow>
                  <SettingRow title="自动检查更新" description="设置选项预览，尚未启动自动检查">
                    <Switch
                      label="自动检查更新"
                      checked={autoUpdate}
                      onChange={(enabled) => {
                        setAutoUpdate(enabled);
                        setNotice("已更新自动检查选项，更新服务尚未接入。");
                      }}
                    />
                  </SettingRow>
                </section>
                <section className={styles.section} aria-label="项目与许可">
                  <h3 className={styles.sectionTitle}>项目与许可</h3>
                  <SettingRow title="项目主页" description="查看项目源码和开发进度">
                    <TextButton onClick={() => setNotice("项目仓库地址尚未配置。")}>查看主页</TextButton>
                  </SettingRow>
                  <SettingRow title="问题反馈" description="报告问题或提出改进建议">
                    <TextButton onClick={() => setNotice("项目反馈地址尚未配置。")}>提交反馈</TextButton>
                  </SettingRow>
                  <SettingRow title="开源许可" description="第三方依赖与许可声明">
                    <TextButton onClick={() => setNotice("依赖许可清单尚未生成，将在发布打包时提供。")}>
                      查看许可
                    </TextButton>
                  </SettingRow>
                  <SettingRow title="参考项目" description="MCDevManager · 仅参考行为与接口">
                    <TextButton
                      onClick={() =>
                        setNotice("参考项目: https://github.com/BitterLemonn/MCDevManager。外部链接打开服务尚未接入。")
                      }
                    >
                      查看项目
                    </TextButton>
                  </SettingRow>
                </section>
              </div>
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
