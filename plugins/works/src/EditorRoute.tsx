import { Button, Notice, type WorkSummary } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import { EditorLoading } from "./editor/EditorLoading";
import { loadedWorkEditor, loadWorkEditor } from "./editor-loader";
import styles from "./WorksPage.module.css";

/** Load the editor only when needed, retaining retry/back actions on a chunk failure */
export function EditorRoute(props: {
  work?: WorkSummary;
  account: string;
  works: WorkSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [module, setModule] = useState(loadedWorkEditor);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void attempt;
    setError(false);
    void loadWorkEditor()
      .then((loaded) => {
        if (active) setModule(loaded);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (error)
    return (
      <div className={styles.page}>
        <Notice>详情界面加载失败，请重试。</Notice>
        <Button onClick={() => setAttempt((v) => v + 1)}>重试</Button>
        <Button onClick={props.onClose}>返回作品管理</Button>
      </div>
    );
  if (!module) return <EditorLoading title={props.work?.name ?? "新增作品"} onClose={props.onClose} />;
  return props.work ? <module.WorkDetailPage {...props} work={props.work} /> : <module.WorkCreatePage {...props} />;
}
