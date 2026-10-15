import {
  Button,
  TextButton,
  type WorkEditorOptions,
  type WorkRecord,
  workResourceAllowed,
  workResourceExtensions,
} from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import { text } from "./fields";
import styles from "./WorkEditor.module.css";

/** Offer picker and native file-drop entry points with identical category restrictions */
export function ResourceFileField({
  resource,
  resourceType,
  choices,
  disabled,
  upload,
  remove,
  onError,
}: {
  resource: WorkRecord | undefined;
  resourceType: number;
  choices: WorkEditorOptions | null;
  disabled: boolean;
  upload: (file?: File) => Promise<void>;
  remove: () => void;
  onError: (message: string) => void;
}) {
  const [over, setOver] = useState(false);
  const extensions = workResourceExtensions.filter(
    (extension) => !choices || workResourceAllowed(`file.${extension}`, resourceType, choices),
  );
  useEffect(() => {
    /** Prevent desktop files dropped outside the target from navigating away */
    const preventNavigation = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventNavigation);
    window.addEventListener("drop", preventNavigation);
    return () => {
      window.removeEventListener("dragover", preventNavigation);
      window.removeEventListener("drop", preventNavigation);
    };
  }, []);
  return (
    <fieldset
      className={`${styles.file} ${!disabled && over ? styles.fileDragOver : ""}`}
      aria-label="资源文件上传"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        setOver(!disabled);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (disabled) return;
        const files = event.dataTransfer.files;
        if (files.length !== 1) {
          onError("每次请拖入一个资源文件");
          return;
        }
        const file = files[0];
        if (!file) return;
        if (!choices || !workResourceAllowed(file.name, resourceType, choices)) {
          onError("文件格式与所选资源类别不匹配");
          return;
        }
        void upload(file);
      }}
    >
      <div className={styles.stack}>
        <strong className={styles.fileName}>{text(resource?.res_name) || "未选择资源文件"}</strong>
        <span className={styles.hint}>{extensions.map((ext) => ext.toUpperCase()).join(" / ")} · 最大 2048M</span>
        <span className={styles.hint}>
          {disabled ? "点击更新后可上传或拖入文件" : "将一个资源文件拖到这里，或点击上传 / 替换"}
        </span>
      </div>
      <div className={styles.actions}>
        <Button
          size="sm"
          disabled={disabled || !choices || !resourceType || !extensions.length}
          onClick={() => void upload()}
        >
          上传 / 替换
        </Button>
        <TextButton tone="danger" disabled={disabled || !resource} onClick={remove}>
          移除
        </TextButton>
      </div>
    </fieldset>
  );
}
