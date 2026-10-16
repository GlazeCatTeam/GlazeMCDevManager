import type { WorkUpload } from "@glaze/contracts";
import { Button, Dialog, TextButton, TextField } from "@glaze/ui";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import styles from "./RichEditor.module.css";
import { sanitizeWorkHtml, workHtmlLength } from "./rich-html";

/** Controlled rich editor with safe image upload and a player-facing preview */
export function RichEditor({
  value,
  onChange,
  disabled,
  upload,
  maxLength = 1000,
  syncFromPe,
  label = "作品详情内容",
  placeholder = "",
  required = false,
  showPreview = true,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  upload: () => Promise<WorkUpload | null>;
  maxLength?: number;
  syncFromPe?: () => string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showPreview?: boolean;
}) {
  const linkId = useId();
  const editor = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const [preview, setPreview] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  useEffect(() => {
    if (editor.current && document.activeElement !== editor.current)
      editor.current.innerHTML = sanitizeWorkHtml(value, true);
  }, [value]);
  /** Capture the selection before toolbar controls take keyboard focus */
  const remember = useCallback(() => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.current?.contains(selection.anchorNode))
      range.current = selection.getRangeAt(0).cloneRange();
  }, []);
  /** Apply one native editing operation and serialize the sanitized HTML */
  const command = useCallback(
    (name: string, argument?: string) => {
      if (disabled || !editor.current) return;
      editor.current.focus();
      if (range.current && editor.current.contains(range.current.commonAncestorContainer)) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range.current);
      }
      document.execCommand(name, false, argument);
      onChange(sanitizeWorkHtml(editor.current.innerHTML));
      remember();
    },
    [disabled, onChange, remember],
  );
  // Upload temporarily makes the editor read-only; insert only after React unlocks its DOM.
  useEffect(() => {
    if (!pendingImage || disabled) return;
    const image = document.createElement("img");
    image.src = pendingImage;
    command("insertHTML", sanitizeWorkHtml(image.outerHTML, true));
    setPendingImage(null);
  }, [pendingImage, disabled, command]);
  /** Insert the uploaded URL via the same sanitizer as existing content */
  const insertImage = async () => {
    remember();
    const file = await upload();
    if (file) setPendingImage(file.url);
  };
  return (
    <div className={styles.stack}>
      <fieldset className={styles.toolbar} disabled={disabled} aria-label="富文本格式">
        <select
          aria-label="文字大小"
          className={styles.compactSelect}
          defaultValue="3"
          onChange={(e) => command("fontSize", e.target.value)}
        >
          <option value="3">正文</option>
          <option value="5">大字</option>
          <option value="7">超大字</option>
        </select>
        {[
          ["bold", "加粗", "B"],
          ["italic", "斜体", "I"],
          ["underline", "下划线", "U"],
          ["strikeThrough", "删除线", "S"],
        ].map(([action, label, glyph]) => (
          <Button
            key={action}
            size="xs"
            aria-label={label}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => command(action ?? "")}
          >
            {glyph}
          </Button>
        ))}
        <select aria-label="对齐方式" className={styles.compactSelect} onChange={(e) => command(e.target.value)}>
          <option value="justifyLeft">左对齐</option>
          <option value="justifyCenter">居中</option>
          <option value="justifyRight">右对齐</option>
        </select>
        <label className={styles.color}>
          文字
          <input type="color" aria-label="文字颜色" onChange={(e) => command("foreColor", e.target.value)} />
        </label>
        <label className={styles.color}>
          底色
          <input type="color" aria-label="文字背景色" onChange={(e) => command("hiliteColor", e.target.value)} />
        </label>
        <TextButton
          onClick={() => {
            remember();
            setLink("");
          }}
        >
          链接
        </TextButton>
        <TextButton onClick={() => void insertImage()}>上传图片</TextButton>
        {syncFromPe && (
          <TextButton
            onClick={() => {
              const html = sanitizeWorkHtml(syncFromPe());
              if (editor.current) editor.current.innerHTML = sanitizeWorkHtml(html, true);
              range.current = null;
              onChange(html);
            }}
          >
            同步 PE 详情
          </TextButton>
        )}
      </fieldset>
      {/* biome-ignore lint/a11y/useSemanticElements: Native textareas cannot edit rich text */}
      <div
        ref={editor}
        role="textbox"
        tabIndex={0}
        aria-label={label}
        aria-required={required}
        data-placeholder={placeholder}
        aria-multiline="true"
        aria-readonly={disabled}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={styles.richEditor}
        onKeyUp={remember}
        onMouseUp={remember}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) e.preventDefault();
        }}
        onInput={() => onChange(sanitizeWorkHtml(editor.current?.innerHTML ?? ""))}
        onPaste={(e) => {
          e.preventDefault();
          command("insertText", e.clipboardData.getData("text/plain"));
        }}
      />
      {showPreview && (
        <div className={styles.spread}>
          <TextButton onClick={() => setPreview(!preview)}>{preview ? "收起" : "手机预览"}</TextButton>
          <span className={workHtmlLength(value) > maxLength ? styles.danger : styles.hint}>
            {workHtmlLength(value)} / {maxLength}
          </span>
        </div>
      )}
      {preview && (
        <section
          className={styles.phone}
          onClick={(e) => e.preventDefault()}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          aria-label="玩家预览"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Only allowlisted sanitized markup reaches this preview
          dangerouslySetInnerHTML={{ __html: sanitizeWorkHtml(value, true) }}
        />
      )}
      {link !== null && (
        <Dialog
          title="插入链接"
          onClose={() => setLink(null)}
          actions={
            <>
              <Button onClick={() => setLink(null)}>取消</Button>
              <Button
                variant="primary"
                disabled={!/^https?:\/\//i.test(link)}
                onClick={() => {
                  command("createLink", link);
                  setLink(null);
                }}
              >
                插入
              </Button>
            </>
          }
        >
          <TextField id={linkId} label="链接地址" value={link} onChange={setLink} />
        </Dialog>
      )}
    </div>
  );
}
