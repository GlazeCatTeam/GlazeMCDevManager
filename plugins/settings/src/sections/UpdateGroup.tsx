import {
  Button,
  Dialog,
  formatShortDateTime,
  ProgressBar,
  Switch,
  TextButton,
  type UpdateState,
} from "@glaze/plugin-sdk";
import { useState } from "react";
import { useAppUpdate } from "../useAppUpdate";
import { SettingGroup, SettingRow } from "../widgets/SettingRow";
import styles from "./AboutSection.module.css";
import sections from "./Sections.module.css";

/** One sentence for where the update stands */
function describe(state: UpdateState): string {
  switch (state.phase) {
    case "unsupported":
      return "开发模式或免安装版不能自动更新，可到发布页下载安装包";
    case "checking":
      return "正在检查新版本…";
    case "latest":
      return `已是最新版本${state.checkedAt ? ` · 上次检查 ${formatShortDateTime(state.checkedAt)}` : ""}`;
    case "downloading":
      return `正在下载 v${state.latestVersion} · ${Math.round((state.progress ?? 0) * 100)}%`;
    case "downloaded":
      return `v${state.latestVersion} 已下载，重启应用即可完成安装`;
    case "error":
      return state.error ?? "检查更新失败";
    default:
      return state.autoCheck ? "启动后会自动检查" : "尚未检查";
  }
}

export interface UpdateGroupProps {
  /** Open the releases page when this copy cannot update itself */
  onOpenReleases: () => void;
  onNotice: (message: string) => void;
}

/** Check, download progress, restart-to-install and the automatic check switch */
export function UpdateGroup({ onOpenReleases, onNotice }: UpdateGroupProps) {
  const update = useAppUpdate();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const state = update.state;

  const act = async (action: () => Promise<void>, done?: string) => {
    if (busy) return;
    setBusy(true);
    onNotice("");
    try {
      await action();
      if (done) onNotice(done);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  if (!state)
    return (
      <SettingGroup title="更新">
        <SettingRow title="当前版本" description={update.error ? `读取更新状态失败：${update.error}` : "正在读取…"}>
          {update.error && (
            <Button size="xs" onClick={update.reload}>
              重试
            </Button>
          )}
        </SettingRow>
      </SettingGroup>
    );

  const working = state.phase === "checking" || state.phase === "downloading";
  return (
    <SettingGroup title="更新">
      <SettingRow title={`当前版本 v${state.currentVersion}`} description={describe(state)}>
        {state.phase === "unsupported" ? (
          <TextButton onClick={onOpenReleases}>打开发布页</TextButton>
        ) : state.phase === "downloaded" ? (
          <Button size="xs" variant="primary" onClick={() => setConfirming(true)}>
            重启并安装
          </Button>
        ) : (
          <Button size="xs" disabled={busy || working} onClick={() => void act(update.check)}>
            {state.phase === "error" ? "重试" : working ? "检查中…" : "检查更新"}
          </Button>
        )}
      </SettingRow>
      {state.phase === "downloading" && (
        <ProgressBar value={state.progress ?? 0} label={`新版本下载进度 ${Math.round((state.progress ?? 0) * 100)}%`} />
      )}
      {state.latestVersion && state.releaseNotes && (
        <details className={styles.releaseNotes}>
          <summary>v{state.latestVersion} 更新说明</summary>
          <pre>{state.releaseNotes}</pre>
        </details>
      )}
      <SettingRow
        title="自动检查更新"
        description={
          state.phase === "unsupported" ? "当前版本不会自动检查" : "启动后及每 6 小时检查一次，有新版本时在后台下载"
        }
      >
        <Switch
          label="自动检查更新"
          checked={state.autoCheck}
          disabled={busy}
          onChange={(enabled) =>
            void act(() => update.setAutoCheck(enabled), enabled ? "已开启自动检查更新。" : "已关闭自动检查更新。")
          }
        />
      </SettingRow>
      {state.phase === "error" && (
        <p className={sections.muted}>
          也可以到发布页手动下载安装包：<TextButton onClick={onOpenReleases}>打开发布页</TextButton>
        </p>
      )}
      {confirming && (
        <Dialog
          title="重启并安装更新"
          onClose={() => setConfirming(false)}
          actions={
            <>
              <Button onClick={() => setConfirming(false)}>稍后</Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await update.install();
                    setConfirming(false);
                  })
                }
              >
                立即重启
              </Button>
            </>
          }
        >
          <p>应用会关闭并安装 v{state.latestVersion}，完成后自动重新打开。未保存的编辑内容会丢失。</p>
          <p className={sections.muted}>不想现在重启也没关系，下次正常退出应用时会自动安装。</p>
        </Dialog>
      )}
    </SettingGroup>
  );
}
