import { PageHeader, Panel, TextButton } from "@glaze/plugin-sdk";
import styles from "./WorkEditor.module.css";

/** Preserve the OreUI page frame and a working back action while data or code loads */
export function EditorLoading({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className={styles.page} aria-busy="true">
      <TextButton onClick={onClose}>‹ 返回作品管理</TextButton>
      <PageHeader title={title} subtitle="正在加载作品详情…" />
      <Panel title="基本信息">
        <span className={styles.hint} role="status">
          正在读取最新信息，请稍候…
        </span>
      </Panel>
    </div>
  );
}
