import {
  Button,
  callHost,
  Dialog,
  Notice,
  type PluginInstallPreview,
  Switch,
  Tag,
  usePluginRegistry,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import { SettingGroup, SettingRow } from "../widgets/SettingRow";
import sections from "./Sections.module.css";

/** Manage actual host modules and install validated local theme packages */
export function PluginsSection() {
  const registry = usePluginRegistry();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<PluginInstallPreview | null>(null);
  const plugins = registry?.snapshot?.plugins ?? [];

  /** Show host failures and keep the authoritative registry state unchanged */
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "插件操作失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  /** Persist a module switch before its navigation and runtime lifecycle change */
  const toggle = (id: string, enabled: boolean) =>
    void run(async () => {
      const result = await callHost("plugins.setEnabled", { id, enabled });
      if (!result.ok) throw new Error(result.error.message);
      setStatus(enabled ? "插件已启用并保存。" : "插件已停用并保存。共享数据读取仍可供其他模块使用。");
    });

  /** Inspect the native-selected archive before asking to install it */
  const pick = () =>
    void run(async () => {
      const result = await callHost("plugins.pickInstall");
      if (!result.ok) throw new Error(result.error.message);
      setPreview(result.value);
      if (!result.value) setStatus("已取消选择插件包。");
    });

  /** Confirm a no-code theme package and publish it to the appearance selector */
  const install = () =>
    void run(async () => {
      if (!preview) return;
      const result = await callHost("plugins.install", { token: preview.token });
      setPreview(null);
      if (!result.ok) throw new Error(result.error.message);
      setStatus("主题已安装；启用后可在外观设置中选择，状态会跨重启保留。");
    });

  return (
    <div className={sections.stack}>
      <div className={sections.toolbar}>
        <span className={sections.muted}>本地安装支持无代码主题包（.glazeplugin / ZIP）</span>
        <Button size="xs" disabled={busy || !registry?.snapshot} onClick={pick}>
          安装本地插件
        </Button>
      </div>
      {(!registry || registry.error) && (
        <Notice action={registry && <Button onClick={registry.refresh}>重试</Button>}>
          {registry?.error || "插件宿主未连接"}
        </Notice>
      )}
      {(["builtin", "theme"] as const).map((kind) => (
        <SettingGroup key={kind} title={kind === "builtin" ? "内置插件" : "主题包"}>
          {plugins
            .filter((item) => item.kind === kind)
            .map((plugin) => (
              <SettingRow
                key={plugin.id}
                title={`${plugin.name} · ${plugin.version}`}
                description={plugin.error ?? plugin.description}
              >
                {plugin.required ? (
                  <Tag>{kind === "builtin" ? "必需" : "内置"}</Tag>
                ) : (
                  <Switch
                    label={`启用${plugin.name}`}
                    checked={plugin.enabled}
                    disabled={busy || !!plugin.error}
                    onChange={(enabled) => toggle(plugin.id, enabled)}
                  />
                )}
              </SettingRow>
            ))}
        </SettingGroup>
      ))}
      <div role="status" className={sections.muted}>
        {status}
      </div>
      {preview && (
        <Dialog
          title={preview.previousVersion ? "更新本地主题？" : "安装本地主题？"}
          onClose={() => {
            if (!busy) setPreview(null);
          }}
          actions={
            <>
              <Button disabled={busy} onClick={() => setPreview(null)}>
                取消
              </Button>
              <Button variant="primary" disabled={busy} onClick={install}>
                {busy ? "正在安装…" : "确认安装"}
              </Button>
            </>
          }
        >
          <p>
            {preview.name} · {preview.version}
          </p>
          <p>{preview.description}</p>
          <p>仅包含主题样式，不执行插件代码，也不授予账号、网络或文件访问权限。</p>
          {preview.previousVersion && <p>将替换当前使用的 {preview.previousVersion} 版本，已保存的启用状态保留。</p>}
        </Dialog>
      )}
    </div>
  );
}
