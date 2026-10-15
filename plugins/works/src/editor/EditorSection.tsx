import { Button, Panel, type WorkSection } from "@glaze/plugin-sdk";
import type { ReactNode } from "react";
import styles from "./WorkEditor.module.css";

export interface EditorSectionActions {
  disabled: boolean;
  editing: (section: WorkSection) => boolean;
  beginEdit: (section: WorkSection) => void;
  dirty: (section: WorkSection) => boolean;
  save: (section: WorkSection) => void;
  creating?: boolean;
}

/** Existing sections unlock explicitly; their update button never performs a platform write */
export function EditorSection({
  section,
  title,
  children,
  disabled,
  editing,
  beginEdit,
  dirty,
  save,
  creating = false,
}: EditorSectionActions & { section: WorkSection; title: string; children: ReactNode }) {
  const unlocked = creating || editing(section);
  return (
    <Panel
      title={title}
      actions={
        !creating &&
        (unlocked ? (
          <Button size="sm" disabled={disabled || !dirty(section)} onClick={() => save(section)}>
            保存此分区
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            aria-label={`更新${title}`}
            disabled={disabled}
            onClick={() => beginEdit(section)}
          >
            更新
          </Button>
        ))
      }
    >
      <fieldset className={styles.sectionFields} disabled={disabled || !unlocked} aria-label={`${title}内容`}>
        {children}
      </fieldset>
    </Panel>
  );
}
