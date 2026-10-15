import { Button, SearchField, TextButton } from "@glaze/plugin-sdk";
import { useId, useState } from "react";
import type { Resource } from "../data";
import styles from "./ResourceSelector.module.css";
import { Swatch } from "./Swatch";

interface ResourceSelectorProps {
  resources: Resource[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/** Keep chosen resources visible while browsing a searchable, vertically scrolling list */
export function ResourceSelector({ resources, selectedIds, onChange }: ResourceSelectorProps) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const selected = resources.filter((resource) => selectedIds.includes(resource.id));
  const keyword = search.trim().toLocaleLowerCase();
  const visible = resources.filter((resource) => resource.name.toLocaleLowerCase().includes(keyword));

  /** Change the pending selection without querying the platform */
  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]);
  };

  return (
    <div className={styles.selector}>
      <div className={styles.heading}>
        <div className={styles.title}>
          <strong>对比资源</strong>
          <span className={styles.count} aria-live="polite">
            已选 {selected.length} / {resources.length}
          </span>
        </div>
        <div className={styles.actions}>
          {selected.length > 0 && (
            <TextButton tone="subtle" onClick={() => onChange([])}>
              清空
            </TextButton>
          )}
          <Button
            size="sm"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "收起资源" : "选择资源"}
          </Button>
        </div>
      </div>
      <fieldset className={styles.selected} aria-label="已选对比资源">
        {selected.map((resource) => (
          <button
            key={resource.id}
            type="button"
            className={styles.selectedItem}
            title={resource.name}
            aria-label={`移除${resource.name}`}
            onClick={() => toggle(resource.id)}
          >
            <Swatch color={resource.color} />
            <span className={styles.selectedName}>{resource.name}</span>
            <span className={styles.remove} aria-hidden="true">
              ×
            </span>
          </button>
        ))}
        {selected.length === 0 && <span className={styles.empty}>尚未选择资源，点击“选择资源”添加对比作品</span>}
      </fieldset>
      <div id={listId} hidden={!expanded} className={styles.browser}>
        <div className={styles.searchRow}>
          <SearchField label="搜索对比资源" placeholder="搜索资源名称…" value={search} onChange={setSearch} />
          <span className={styles.count}>
            {keyword ? `找到 ${visible.length} 个资源` : "勾选资源后，点击下方查询数据"}
          </span>
        </div>
        <fieldset className={styles.options} aria-label="选择对比资源">
          {visible.map((resource) => (
            <label
              key={resource.id}
              className={selectedIds.includes(resource.id) ? `${styles.option} ${styles.checked}` : styles.option}
            >
              <input type="checkbox" checked={selectedIds.includes(resource.id)} onChange={() => toggle(resource.id)} />
              <Swatch color={resource.color} />
              <span>{resource.name}</span>
            </label>
          ))}
          {visible.length === 0 && <p className={styles.empty}>没有匹配的资源，试试其他关键词</p>}
        </fieldset>
      </div>
    </div>
  );
}
