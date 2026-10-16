import {
  Button,
  callHost,
  Dialog,
  deferredWorkCreatePatch,
  emptyWorkCreateFields,
  matchPcClassification,
  Notice,
  normalizePcRequirements,
  PageHeader,
  Panel,
  type RpcResult,
  Tag,
  TextButton,
  uploadDroppedResource,
  type WorkCrop,
  type WorkEditorDocument,
  type WorkEditorOptions,
  type WorkImageDraft,
  type WorkRecord,
  type WorkSection,
  type WorkSummary,
  type WorkUpload,
  type WorkValue,
  workResourceAllowed,
  workSections,
} from "@glaze/plugin-sdk";
import { useEffect, useRef, useState } from "react";
import { priceText } from "../format";
import { statusLabels } from "../status";
import { useWorkEditor, useWorkOptions } from "../useWorkQuery";
import { CurrencyIcon, WorkPrice } from "../widgets/WorkPrice";
import { AuthorizationField, DiscountFields, LobbyFields } from "./AdvancedFields";
import { CompleteCreation } from "./CompleteCreation";
import { EditorLoading } from "./EditorLoading";
import { EditorSection as Section } from "./EditorSection";
import { Field, Input, number, object, rows, Select, text, YesNo } from "./fields";
import { ImageCropDialog } from "./ImageCropDialog";
import { ImageSlots, MediaSections, type UploadFile } from "./MediaSections";
import { ReferencePicker } from "./ReferencePicker";
import { ResourceFileField } from "./ResourceFileField";
import { RichEditor } from "./RichEditor";
import { workHtmlLength } from "./rich-html";
import styles from "./WorkEditor.module.css";

const tabs = [
  { id: "basic", label: "基本信息" },
  { id: "price", label: "资源定价" },
  { id: "detail", label: "详情与攻略" },
  { id: "resource", label: "资源文件" },
  { id: "media", label: "图片与视频" },
  { id: "release", label: "更新与上架" },
];
const diamondPrices = [300, 600, 1000, 2000, 5000, 10000, 20000];
const editableStatuses = new Set(["init", "online", "reject", "offline", "system_offline"]);
const drafts = new Map<
  string,
  { document: WorkEditorDocument; base: WorkRecord; value: WorkRecord; uncertain?: boolean; created?: boolean }
>();

interface DetailProps {
  work: WorkSummary;
  account: string;
  works: WorkSummary[];
  onClose: () => void;
  onSaved: () => void;
  creating?: boolean;
}

/** New works use the existing editor without requesting a nonexistent server detail */
export function WorkCreatePage(props: Omit<DetailProps, "work" | "creating">) {
  const choices = useWorkOptions(props.account);
  const [revision, setRevision] = useState(0);
  const work: WorkSummary = {
    itemId: "",
    name: "新增作品",
    status: "init",
    price: 0,
    priceType: "free",
    isOriginal: true,
    syncPc: false,
    isPrerequisite: false,
    weakOffline: false,
    weakOfflineReason: null,
    createTime: "",
    applyReviewTime: null,
  };
  return (
    <Editor
      {...props}
      key={revision}
      creating
      work={work}
      initial={{ itemId: "", status: "init", version: "0.1", modCode: "", guides: [], fields: emptyWorkCreateFields() }}
      choices={choices.data}
      optionsError={choices.error?.message ?? null}
      reloadOptions={choices.reload}
      reload={() => setRevision((v) => v + 1)}
    />
  );
}

/** Full-page details reuse the workbench shell and reload with the captured account */
export function WorkDetailPage(props: DetailProps) {
  const detail = useWorkEditor(props.account, props.work.itemId);
  const choices = useWorkOptions(props.account);
  const [snapshot, setSnapshot] = useState(detail.data);
  const [revision, setRevision] = useState(0);
  // A fast refresh can skip the loading render; remount for every new authoritative snapshot
  if (detail.data !== snapshot) {
    setSnapshot(detail.data);
    setRevision(revision + 1);
  }
  if (detail.loading) return <EditorLoading title={props.work.name} onClose={props.onClose} />;
  if (!detail.data || detail.error)
    return (
      <div className={styles.page}>
        <TextButton onClick={props.onClose}>‹ 返回作品管理</TextButton>
        <Notice action={<TextButton onClick={detail.reload}>重试</TextButton>}>
          {detail.error?.message ?? "无法读取作品详情"}
        </Notice>
      </div>
    );
  return (
    <Editor
      {...props}
      key={revision}
      initial={detail.data}
      choices={choices.data}
      optionsError={choices.error?.message ?? null}
      reloadOptions={choices.reload}
      reload={detail.reload}
    />
  );
}

/** Use bounded platform search for related works in both new and existing drafts */
function RelatedWorkPicker({
  account,
  itemId,
  value,
  disabled,
  onChange,
}: {
  account: string;
  itemId: string;
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <ReferencePicker
      account={account}
      itemId={itemId}
      kind="related"
      label="关联模组"
      selected={value && value !== "0" ? [{ itemId: value, name: value }] : []}
      disabled={disabled}
      onChange={(items) => onChange(items[0]?.itemId ?? "")}
    />
  );
}

/** Account-scoped draft editor; uncommitted fields survive partial saves */
function Editor({
  initial,
  choices,
  optionsError,
  reloadOptions,
  reload,
  ...props
}: DetailProps & {
  initial: WorkEditorDocument;
  choices: WorkEditorOptions | null;
  optionsError: string | null;
  reloadOptions: () => void;
  reload: () => void;
}) {
  const draftKey = `${props.account}:${props.work.itemId}`;
  const [restored] = useState(() => drafts.get(draftKey));
  const [document, setDocument] = useState(initial);
  const [base, setBase] = useState(restored?.base ?? initial.fields);
  const [value, setValue] = useState(restored?.value ?? initial.fields);
  const [tab, setTab] = useState("basic");
  const [busy, setBusy] = useState(false);
  const [editingSections, setEditingSections] = useState<WorkSection[]>([]);
  const lock = useRef(false);
  const alive = useRef(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(restored?.uncertain ?? false);
  const [created, setCreated] = useState(restored?.created ?? false);
  const [cropping, setCropping] = useState<WorkImageDraft | null>(null);
  const cropResolve = useRef<((crop: WorkCrop | null) => void) | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [confirm, setConfirm] = useState<"back" | "reload" | "review" | "create" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dirtyKeys = Object.keys(value).filter(
    (key) => JSON.stringify(value[key] ?? null) !== JSON.stringify(base[key] ?? null),
  );
  const writable = editableStatuses.has(document.status);
  const blocked = busy || !writable || uncertain;
  const editing = (section: WorkSection) => props.creating === true || editingSections.includes(section);
  const activeSection = tab === "release" || tab === "media" ? null : (tab as WorkSection);
  const disabled = blocked || (activeSection !== null && !editing(activeSection));
  /** Unlocking changes local interaction only and never saves or uploads */
  const beginEdit = (section: WorkSection) => {
    if (!blocked) setEditingSections((old) => (old.includes(section) ? old : [...old, section]));
  };
  /** Gate field changes and bulk saves by the sections explicitly unlocked in this visit */
  const canChange = (key: string) =>
    props.creating === true ||
    Object.entries(workSections).some(
      ([section, keys]) =>
        editingSections.includes(section as WorkSection) && (keys as readonly string[]).includes(key),
    );
  const sync = object(value.sync_item_info);
  const dlc = object(value.dlc_info);
  const imageChoices = choices?.peImages ?? [];
  const availableTabs =
    number(value.pri_type) === 9
      ? tabs.filter((t) => !["price", "media"].includes(t.id))
      : value.sync_pc_flag
        ? [...tabs, { id: "pc", label: "PC 同步" }]
        : tabs;

  useEffect(() => {
    if (JSON.stringify(base) === JSON.stringify(value) && !uncertain && !created) drafts.delete(draftKey);
    else drafts.set(draftKey, { document, base, value, uncertain, created });
  }, [draftKey, document, base, value, uncertain, created]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cropResolve.current?.(null);
    };
  }, []);
  useEffect(() => {
    /** Prevent accidental window closure while edits or a request are outstanding */
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyKeys.length || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirtyKeys.length, busy]);

  /** Update one field while preserving the untouched portion of the server document */
  const change = (key: string, next: WorkValue) => {
    if (!blocked && (canChange(key) || (key === "sync_item_info" && editing("basic"))))
      setValue((old) => {
        const updated = { ...old, [key]: next };
        if (
          choices &&
          base.sync_pc_flag !== true &&
          updated.sync_pc_flag === true &&
          ["pri_type", "sub_type"].includes(key)
        )
          updated.sync_item_info = matchPcClassification(updated, object(updated.sync_item_info), choices);
        return updated;
      });
  };
  const changePc = (key: string, next: WorkValue) => change("sync_item_info", { ...sync, [key]: next });
  const dirty = (section: WorkSection) => workSections[section].some((key) => dirtyKeys.includes(key));

  /** Send only changed fields and retain all other drafts if a section is saved */
  const persist = async (section?: WorkSection): Promise<boolean> => {
    const keys = section
      ? dirtyKeys.filter((key) => editing(section) && (workSections[section] as readonly string[]).includes(key))
      : dirtyKeys.filter(canChange);
    if (
      (section === "basic" || section === undefined) &&
      keys.includes("sync_pc_flag") &&
      value.sync_pc_flag === true &&
      dirtyKeys.includes("sync_item_info")
    )
      keys.push("sync_item_info");
    if (section === "pc" && dirtyKeys.includes("sync_pc_flag")) keys.push("sync_pc_flag");
    if (!keys.length) return true;
    if (keys.includes("info") && workHtmlLength(text(value.info)) > 1000) {
      setError("PE 详情不能超过 1000 字");
      return false;
    }
    const patch = Object.fromEntries(keys.map((key) => [key, value[key] ?? null]));
    const baseline = Object.fromEntries(keys.map((key) => [key, base[key] ?? null]));
    const result = await callHost("works.save", {
      itemId: props.work.itemId,
      account: props.account,
      patch,
      base: baseline,
    });
    if (!alive.current) return false;
    if (!result.ok) {
      const unknown =
        ["network", "timeout", "internal"].includes(result.error.kind) ||
        result.error.message.includes("数据格式无法识别");
      setUncertain(unknown);
      setError(
        unknown ? `${result.error.message}。保存结果尚不确定，请刷新作品后核对，暂不重复提交。` : result.error.message,
      );
      return false;
    }
    setBase((old) => ({ ...old, ...patch }));
    setEditingSections((old) =>
      section ? old.filter((s) => s !== section && !workSections[s].some((key) => keys.includes(key))) : [],
    );
    setMessage(
      section
        ? "此分区已保存到网易"
        : keys.length === dirtyKeys.length
          ? "全部修改已保存到网易"
          : "已解锁分区的修改已保存到网易",
    );
    props.onSaved();
    const fresh = await callHost("works.editor", { itemId: props.work.itemId, account: props.account });
    if (!alive.current) return false;
    if (fresh.ok) {
      setDocument(fresh.value);
      const saved = Object.fromEntries(keys.map((key) => [key, fresh.value.fields[key] ?? null]));
      setBase((old) => ({ ...old, ...saved }));
      setValue((old) => ({ ...old, ...saved }));
    } else setError(`保存已成功，但刷新详情失败：${fresh.error.message}。请勿重复提交。`);
    return fresh.ok;
  };

  /** Serialize writes locally and surface failures without automatic retries */
  const run = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (caught) {
      if (alive.current) setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const save = (section?: WorkSection) => {
    if (props.creating) {
      setConfirm("create");
      return;
    }
    void run(async () => {
      await persist(section);
    });
  };

  /** Keep an uncertain draft locked across navigation; never retry creation automatically */
  const create = () => {
    setConfirm(null);
    void run(async () => {
      drafts.set(draftKey, { document, base, value, uncertain: true });
      const result = await callHost("works.create", { account: props.account, fields: value }).catch(() => ({
        ok: false as const,
        error: { kind: "internal", message: "无法确认主进程的创建响应" },
      }));
      if (result.ok) {
        if (Object.keys(deferredWorkCreatePatch(value)).length) {
          drafts.set(draftKey, { document, base, value, created: true });
          if (alive.current) {
            setCreated(true);
            setUncertain(false);
          }
          return;
        }
        drafts.delete(draftKey);
        if (alive.current) props.onSaved();
        return;
      }
      const unknown =
        ["network", "timeout", "internal", "account_changed"].includes(result.error.kind) ||
        result.error.message.includes("数据格式无法识别");
      drafts.set(draftKey, { document, base, value, uncertain: unknown });
      if (!alive.current) return;
      setUncertain(unknown);
      setError(
        unknown
          ? `${result.error.message}。创建结果尚不确定，请返回列表刷新核对，避免重复创建。`
          : result.error.message,
      );
    });
  };

  /** Picked and dropped files share host validation and the same editor write lock */
  const upload: UploadFile = async (kind, channelId, platform = "pe", droppedFile) => {
    if (lock.current || !writable || uncertain) return null;
    const section: WorkSection =
      kind === "proof"
        ? "basic"
        : kind === "resource"
          ? "resource"
          : kind === "banner"
            ? "banner"
            : kind === "video" || kind === "videoCover"
              ? "video"
              : platform === "pc" || tab === "pc"
                ? "pc"
                : kind === "richImage"
                  ? "detail"
                  : "images";
    if (!editing(section)) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("选择文件并上传中，请稍候…");
    try {
      const params = {
        ...(props.creating ? {} : { itemId: props.work.itemId }),
        account: props.account,
        kind,
        platform,
        ...(channelId === undefined ? {} : { channelId }),
        ...(kind === "resource" ? { resourceType: number(value.pri_type) } : {}),
      };
      let result: RpcResult<WorkUpload | null>;
      if (kind === "image" || kind === "banner" || kind === "videoCover" || kind === "proof") {
        const prepared = await callHost("works.prepareImage", { ...params, kind });
        if (!prepared.ok) {
          setError(prepared.error.message);
          setMessage("");
          return null;
        }
        if (!prepared.value) {
          setMessage("已取消文件选择");
          return null;
        }
        const image = prepared.value;
        if (!alive.current) {
          void callHost("works.discardImage", { account: props.account, token: image.token });
          return null;
        }
        const crop = await new Promise<WorkCrop | null>((resolve) => {
          cropResolve.current = resolve;
          setCropping(image);
        });
        cropResolve.current = null;
        if (!crop || !alive.current) {
          void callHost("works.discardImage", { account: props.account, token: image.token });
          setMessage("已取消裁剪，图片未上传");
          return null;
        }
        setMessage("正在上传裁剪后的图片…");
        result = await callHost("works.uploadCroppedImage", { account: props.account, token: image.token, crop });
      } else if (kind === "resource" && droppedFile)
        result = await uploadDroppedResource(droppedFile, {
          account: props.account,
          ...(props.creating ? {} : { itemId: props.work.itemId }),
          resourceType: number(value.pri_type),
        });
      else result = await callHost("works.upload", params);
      if (!alive.current) return null;
      if (!result.ok) {
        setError(result.error.message);
        setMessage("");
        return null;
      }
      setMessage(
        result.value
          ? props.creating
            ? "文件已上传，创建作品时会一并保存"
            : "文件已上传，请保存对应分区以应用到作品"
          : "已取消文件选择",
      );
      return result.value;
    } catch (caught) {
      if (alive.current) setError(caught instanceof Error ? caught.message : "上传失败");
      return null;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };

  /** Complete an explicit review confirmation only after the draft was saved */
  const submit = () => {
    if (dirtyKeys.some((key) => !canChange(key))) {
      setConfirm(null);
      setError("仍有只读分区的恢复草稿，请先点击对应分区的更新并保存，再提交审核。");
      return;
    }
    setConfirm(null);
    void run(async () => {
      if (!(await persist())) return;
      const result = await callHost("works.submitReview", { itemId: props.work.itemId, account: props.account });
      if (!alive.current) return;
      if (!result.ok) {
        setError(`作品已保存，提审未确认成功：${result.error.message}。请先刷新审核状态。`);
        setUncertain(
          ["network", "timeout", "internal"].includes(result.error.kind) ||
            result.error.message.includes("数据格式无法识别"),
        );
        return;
      }
      if (result.value.needCheckApply) {
        setUncertain(true);
        setError("平台要求补充审核确认，请在官方平台完成；本次未确认提审完成。");
        return;
      }
      setDocument((old) => ({ ...old, status: "reviewing" }));
      setMessage(`已提交审核，当前队列 ${result.value.queueLength} 个`);
      props.onSaved();
    });
  };

  /** Add a label with platform recommendations and preserve the source of existing labels */
  const addTag = () => {
    const name = tagInput.trim();
    const existing = rows(value.tag);
    if (!name || existing.some((t) => t.name === name)) return;
    change("tag", [...existing, { name, source: 0 }]);
    setTagInput("");
  };
  const common = { disabled: blocked, editing, beginEdit, dirty, save, creating: props.creating ?? false };
  const peType = number(value.pri_type);
  const resources = rows(value.res);
  const resource = resources[0];

  if (created && props.creating)
    return (
      <CompleteCreation
        account={props.account}
        name={text(value.item_name)}
        patch={deferredWorkCreatePatch(value)}
        uncertain={uncertain}
        onUncertain={setUncertain}
        onClose={props.onSaved}
        onDone={() => {
          drafts.delete(draftKey);
          props.onSaved();
        }}
      />
    );

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <TextButton disabled={busy} onClick={() => (dirtyKeys.length ? setConfirm("back") : props.onClose())}>
          ‹ 返回作品管理
        </TextButton>
        <span>/ {props.creating ? "新增作品" : "模组详情"}</span>
        <Tag>{props.creating ? "未创建" : statusLabels[document.status]}</Tag>
      </div>
      <PageHeader
        title={text(value.item_name) || props.work.name}
        subtitle={`资源版本 ${document.version || "—"} · ${value.sync_pc_flag ? "PE + PC" : "PE"}`}
        actions={
          <>
            <Button disabled={busy} onClick={() => (dirtyKeys.length || uncertain ? setConfirm("reload") : reload())}>
              {props.creating ? "重置表单" : "刷新"}
            </Button>
            {!props.creating && (
              <Button
                disabled={blocked || dirtyKeys.some((key) => !canChange(key))}
                onClick={() => setConfirm("review")}
              >
                提交审核
              </Button>
            )}
            <Button
              variant="primary"
              disabled={blocked || !dirtyKeys.some(canChange) || (props.creating && (!choices || !!optionsError))}
              onClick={() => save()}
            >
              {busy ? "处理中…" : props.creating ? "创建作品" : "保存"}
            </Button>
          </>
        }
      />
      {error && <Notice>{error}</Notice>}
      {props.creating && (
        <Notice>
          {uncertain
            ? "上次创建结果尚未确认，请先返回作品列表核对。重置表单不会撤销已发送的创建请求。"
            : "填写作品信息并上传资源后创建。创建不会自动提交审核；PC、关联、授权和折扣配置会保留，创建后选定准确作品再应用。"}
        </Notice>
      )}
      {message && (
        <div className={styles.success} role="status">
          {message}
        </div>
      )}
      {optionsError && (
        <Notice action={<TextButton onClick={reloadOptions}>重试</TextButton>}>平台选项加载失败：{optionsError}</Notice>
      )}
      {!writable && <Notice>当前状态只允许查看，审核结束或撤销审核后才能修改。</Notice>}
      {!props.creating && writable && (
        <span className={styles.hint}>
          各分区默认只读。点击“更新”后修改，再保存；保存成功后恢复只读。未保存草稿会保留，重新进入需再次点击更新。
        </span>
      )}
      <div className={styles.tabs} role="tablist" aria-label="模组详情分区">
        {availableTabs.map((t) => (
          <button
            className={styles.tab}
            id={`work-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`work-panel-${t.id}`}
            key={t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className={styles.layout}>
        <div className={styles.stack} id={`work-panel-${tab}`} role="tabpanel" aria-labelledby={`work-tab-${tab}`}>
          {tab === "basic" && (
            <Section section="basic" title="基本信息" {...common}>
              <div className={styles.stack}>
                <div className={styles.meta}>
                  <Field label="资源 ID">
                    <span className={styles.mono}>{props.work.itemId || "创建后由平台生成"}</span>
                  </Field>
                  <Field label="模组码">
                    <span className={styles.mono}>{document.modCode || "—"}</span>
                  </Field>
                </div>
                <Input
                  label="资源名称 *"
                  value={text(value.item_name)}
                  disabled={disabled}
                  onChange={(v) => change("item_name", v)}
                />
                <div className={styles.fields}>
                  <YesNo
                    label="加入“我的山头”专区 *"
                    value={value.is_domain_server_item === 1}
                    disabled={disabled || peType === 9}
                    onChange={(v) => change("is_domain_server_item", v ? 1 : 0)}
                  />
                  <YesNo
                    label="原创作品 *"
                    value={value.is_original === true}
                    disabled={disabled}
                    onChange={(v) => change("is_original", v)}
                  />
                </div>
                {peType !== 9 && (
                  <Field label="模组标签">
                    <div className={styles.tagInput}>
                      <input
                        className={styles.input}
                        aria-label="搜索或输入模组标签"
                        value={tagInput}
                        list="work-tag-options"
                        disabled={disabled}
                        placeholder="搜索标签 / 输入自定义标签"
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                      />
                      <datalist id="work-tag-options">
                        {choices?.tags.map((tag) => (
                          <option key={tag}>{tag}</option>
                        ))}
                      </datalist>
                      <Button disabled={disabled || !tagInput.trim()} onClick={addTag}>
                        添加
                      </Button>
                    </div>
                    <div className={styles.tags}>
                      {rows(value.tag).map((tag, i) => (
                        <span className={styles.tag} key={text(tag.name)}>
                          {text(tag.name)}
                          <button
                            type="button"
                            disabled={disabled}
                            aria-label={`移除标签 ${text(tag.name)}`}
                            onClick={() =>
                              change(
                                "tag",
                                rows(value.tag).filter((_, index) => index !== i),
                              )
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </Field>
                )}
                {value.is_original === false && (
                  <AuthorizationField value={value} disabled={disabled} change={change} upload={upload} />
                )}
                <Input
                  label="活动参与说明"
                  value={text(value.activity_desc)}
                  disabled={disabled}
                  multiline
                  onChange={(v) => change("activity_desc", v)}
                />
                <span className={styles.hint}>仅平台可见，不会在游戏端出现。</span>
                <div className={styles.fields}>
                  <YesNo
                    label="是否为关联模组"
                    value={dlc.dlc_switch === true}
                    disabled={disabled || peType === 9}
                    onChange={(v) =>
                      change("dlc_info", {
                        ...dlc,
                        dlc_switch: v,
                        dlc_type: v ? (text(dlc.dlc_type) === "slave" ? "slave" : "master") : "off",
                      })
                    }
                  />
                  <YesNo
                    label="同步生成 PC 模组"
                    value={value.sync_pc_flag === true}
                    disabled={disabled || peType === 9 || !choices}
                    onChange={(v) => {
                      change("sync_pc_flag", v);
                      if (v && choices && base.sync_pc_flag !== true)
                        change(
                          "sync_item_info",
                          matchPcClassification(
                            value,
                            {
                              item_name: text(value.item_name),
                              brief: "",
                              info: "",
                              pri_type: 0,
                              sub_type: 0,
                              available_scope: choices?.pcScopes[0]?.id ?? "",
                              include_map: false,
                              tag: [],
                              channel: [],
                              requirement: [],
                              weak_offline: false,
                              weak_offline_reason: "",
                              ...sync,
                            },
                            choices,
                          ),
                        );
                    }}
                  />
                </div>
                {dlc.dlc_switch === true && (
                  <div className={styles.fields}>
                    <Field label="当前模组类型">
                      <select
                        aria-label="当前模组类型"
                        className={styles.input}
                        value={text(dlc.dlc_type)}
                        disabled={disabled}
                        onChange={(e) => change("dlc_info", { ...dlc, dlc_type: e.target.value })}
                      >
                        <option value="master">主包</option>
                        <option value="slave">副包</option>
                      </select>
                    </Field>
                    <RelatedWorkPicker
                      account={props.account}
                      itemId={props.work.itemId}
                      value={text(value.relate_item_id)}
                      disabled={disabled}
                      onChange={(id) => change("relate_item_id", id)}
                    />
                  </div>
                )}
                {value.sync_pc_flag === true && (
                  <TextButton onClick={() => setTab("pc")}>配置 PC 详情、资源分类及图片 ›</TextButton>
                )}
              </div>
            </Section>
          )}
          {tab === "price" && (
            <Section section="price" title="资源定价" {...common}>
              <div className={styles.stack}>
                <Field label="定价类型">
                  {props.creating ? (
                    <select
                      className={styles.input}
                      aria-label="定价类型"
                      value={text(value.price_type)}
                      disabled={disabled || !choices}
                      onChange={(e) => {
                        const type = e.target.value;
                        change("price_type", type);
                        change("price_rank", type === "diamond" ? 0 : type === "point" ? -5 : -4);
                        change(
                          "price",
                          type === "diamond" ? 300 : (choices?.prices.find((p) => p.id === type)?.min ?? 0),
                        );
                      }}
                    >
                      <option value="free">免费</option>
                      {choices?.prices
                        .filter((p) => ["diamond", "point"].includes(p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <Tag>
                      {value.price_type === "diamond" || value.price_type === "point" ? (
                        <CurrencyIcon type={value.price_type} />
                      ) : (
                        "免费"
                      )}
                    </Tag>
                  )}
                </Field>
                <p className={styles.hint}>
                  {props.creating
                    ? "请确认定价类型，创建后此处不可切换。"
                    : "已有作品保留原定价类型；前置模组强制免费。"}
                </p>
                {value.price_type === "diamond" ? (
                  <Select
                    label="钻石价格档位"
                    value={number(value.price_rank)}
                    choices={diamondPrices.map((price, id) => ({ id, title: `${price} 钻石` }))}
                    disabled={disabled}
                    onChange={(rank) => {
                      change("price_rank", rank);
                      change("price", diamondPrices[rank] ?? number(value.price));
                    }}
                  />
                ) : (
                  <Field label="价格">
                    <input
                      type="number"
                      aria-label="资源价格"
                      className={styles.input}
                      value={number(value.price)}
                      min={choices?.prices.find((p) => p.id === value.price_type)?.min ?? 0}
                      max={choices?.prices.find((p) => p.id === value.price_type)?.max ?? undefined}
                      step={choices?.prices.find((p) => p.id === value.price_type)?.step || 1}
                      disabled={disabled || value.price_type === "free"}
                      onChange={(e) => change("price", Number(e.target.value))}
                    />
                  </Field>
                )}
                <DiscountFields value={value} disabled={disabled || peType === 9} change={change} />
              </div>
            </Section>
          )}
          {tab === "detail" && (
            <>
              <Section section="detail" title="PE 详情信息" {...common}>
                <RichEditor
                  value={text(value.info)}
                  disabled={disabled}
                  onChange={(v) => change("info", v)}
                  upload={() => upload("richImage")}
                />
              </Section>
              <Panel title={`模组攻略 (${document.guides.length}/5)`}>
                <div className={styles.stack}>
                  {document.guides.length ? (
                    document.guides.map((guide, i) => (
                      <div className={styles.guide} key={text(object(guide).id) || JSON.stringify(guide)}>
                        <Tag>{text(object(guide).status) || "平台记录"}</Tag>
                        <span>
                          {text(object(guide).name ?? object(guide).title ?? object(guide).guide_name) ||
                            `攻略 ${i + 1}`}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className={styles.hint}>暂无上传内容</p>
                  )}
                  <span className={styles.hint}>当前暂不支持编辑攻略，已上传内容会保留。请在开发者平台管理。</span>
                  <Button disabled title="暂不支持攻略上传，请在开发者平台管理">
                    上传攻略
                  </Button>
                </div>
              </Panel>
            </>
          )}
          {tab === "resource" && (
            <Section section="resource" title="上传 PE 资源管理" {...common}>
              <div className={styles.stack}>
                <div className={styles.fields}>
                  <Select
                    label="资源类别 *"
                    value={peType}
                    choices={[
                      ...(choices?.peTypes ?? []).filter(
                        (option) =>
                          option.id !== 9 &&
                          (!resource ||
                            !choices ||
                            option.id === peType ||
                            workResourceAllowed(text(resource.res_name), option.id, choices)),
                      ),
                      ...(peType === 9 || (props.creating && choices?.prerequisiteAllowed)
                        ? [{ id: 9, title: "前置模组" }]
                        : []),
                    ].filter((option) => props.creating || peType !== 9 || option.id === 9)}
                    disabled={disabled || !choices}
                    onChange={(v) => {
                      change("pri_type", v);
                      change("sub_type", choices?.peSubTypes[String(v)]?.[0]?.id ?? 0);
                      change("mod_second_type", 0);
                      if (v === 6) {
                        const defaults = emptyWorkCreateFields();
                        for (const key of [
                          "lobby_min_num",
                          "lobby_max_num",
                          "lobby_force_max_num",
                          "lobby_tags",
                          "is_lobby_competitive",
                          "is_asymmetric",
                          "lobby_camps",
                          "lobby_player_num",
                          "lobby_normal_mode",
                          "lobby_reconnect_time",
                        ])
                          change(key, value[key] ?? defaults[key] ?? null);
                      }
                      if (v === 9) {
                        change("price_type", "free");
                        change("price_rank", -4);
                        change("price", 0);
                        change("discount", []);
                        change("sync_pc_flag", false);
                        change("sync_item_info", {});
                        change("pe_is_add_play_plan", false);
                        change("prerequisite_items", []);
                        change("tag", []);
                        change("label_type_list", []);
                        change("channel", []);
                        change("video_info_list", []);
                        change("dlc_info", { dlc_switch: false, dlc_type: "off", master: {}, slave_list: [] });
                        change("relate_item_id", "");
                      }
                    }}
                  />
                  <Select
                    label="具体类别"
                    value={number(value.sub_type)}
                    choices={choices?.peSubTypes[String(peType)] ?? []}
                    disabled={disabled}
                    onChange={(v) => {
                      change("sub_type", v);
                      change("mod_second_type", 0);
                    }}
                  />
                  <Select
                    label="次级分类"
                    value={number(value.mod_second_type)}
                    choices={choices?.secondTypes[String(value.sub_type)] ?? []}
                    disabled={disabled}
                    onChange={(v) => change("mod_second_type", v)}
                  />
                  <Field label="modAPI 版本 *">
                    <select
                      className={styles.input}
                      aria-label="modAPI 版本"
                      disabled={disabled || !choices}
                      value={text(value.mod_version)}
                      onChange={(e) => change("mod_version", e.target.value)}
                    >
                      {!choices?.versions.includes(text(value.mod_version)) && (
                        <option value={text(value.mod_version)}>{text(value.mod_version) || "请选择"}</option>
                      )}
                      {choices?.versions.map((version) => (
                        <option key={version}>{version}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                {peType !== 9 &&
                  Object.entries(choices?.recommendTags ?? {}).map(([group, options]) => (
                    <Field key={group} label={`推荐标签 · ${group === "1" ? "玩法" : group === "2" ? "主题" : group}`}>
                      <div className={styles.checks}>
                        {options.map((option) => (
                          <label key={option.id}>
                            <input
                              type="checkbox"
                              checked={
                                Array.isArray(value.label_type_list) && value.label_type_list.includes(option.id)
                              }
                              disabled={disabled}
                              onChange={(e) => {
                                const selected = Array.isArray(value.label_type_list) ? value.label_type_list : [];
                                change(
                                  "label_type_list",
                                  e.target.checked
                                    ? [...selected, option.id]
                                    : selected.filter((id) => id !== option.id),
                                );
                              }}
                            />
                            {option.title}
                          </label>
                        ))}
                      </div>
                    </Field>
                  ))}
                <div className={styles.fields}>
                  <YesNo
                    label="加入模组畅玩计划"
                    value={value.pe_is_add_play_plan === true}
                    disabled={disabled || peType === 9}
                    onChange={(v) => change("pe_is_add_play_plan", v)}
                  />
                  <YesNo
                    label="坐骑召唤功能 *"
                    value={value.mount_call_enabled === true}
                    disabled={disabled || peType === 9}
                    onChange={(v) => change("mount_call_enabled", v)}
                  />
                  <YesNo
                    label="提升版本 *"
                    value={resource?.add_version !== false}
                    disabled={disabled || !resource}
                    onChange={(v) => change("res", [{ ...resource, add_version: v }, ...resources.slice(1)])}
                  />
                </div>
                {peType !== 9 && (
                  <ReferencePicker
                    account={props.account}
                    itemId={props.work.itemId}
                    kind="pePrerequisite"
                    label="PE 前置模组"
                    selected={rows(value.prerequisite_items).map((row) => ({
                      itemId: text(row.item_id),
                      name: text(row.item_name),
                    }))}
                    disabled={disabled}
                    onChange={(items) =>
                      change(
                        "prerequisite_items",
                        items.map((item) => ({ item_id: item.itemId, item_name: item.name })),
                      )
                    }
                  />
                )}
                {peType === 6 && <LobbyFields value={value} disabled={disabled} change={change} choices={choices} />}
                <Field label="资源文件 *">
                  <ResourceFileField
                    resource={resource}
                    resourceType={peType}
                    choices={choices}
                    disabled={disabled}
                    onError={setError}
                    remove={() => change("res", [])}
                    upload={async (dropped) => {
                      const file = await upload("resource", undefined, "pe", dropped);
                      if (file)
                        change("res", [
                          {
                            res_name: file.name,
                            res_url: file.receipt,
                            add_version: resource?.add_version !== false,
                            mc_version: Array.isArray(resource?.mc_version) ? resource.mc_version : [],
                          },
                          ...resources.slice(1),
                        ]);
                    }}
                  />
                </Field>
              </div>
            </Section>
          )}
          {tab === "media" && (
            <MediaSections value={value} change={change} choices={choices} upload={upload} {...common} />
          )}
          {tab === "release" && (
            <>
              <Section section="summary" title="PE 更新纪要" {...common}>
                <Input
                  label="本次更新内容"
                  value={text(value.update_summary)}
                  multiline
                  maxLength={200}
                  disabled={disabled}
                  onChange={(v) => change("update_summary", v)}
                />
                <span className={styles.hint}>
                  {text(value.update_summary).length} / 200 · 上架后平台按规则向关注玩家推送更新通知。
                </span>
              </Section>
              <Section section="shelf" title="PE 上架设置" {...common}>
                <YesNo
                  label="是否弱下架"
                  value={value.weak_offline === true}
                  disabled={disabled}
                  onChange={(v) => change("weak_offline", v)}
                />
                <p className={styles.hint}>弱下架后不在列表展示，已获取的玩家仍可使用。</p>
                {value.weak_offline === true && (
                  <Input
                    label="下架原因"
                    value={text(value.weak_offline_reason)}
                    disabled={disabled}
                    multiline
                    onChange={(v) => change("weak_offline_reason", v)}
                  />
                )}
              </Section>
              <Panel title="审核信息">
                <div className={styles.stack}>
                  <Tag>{statusLabels[document.status]}</Tag>
                  <TextButton
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await callHost("works.reviewFeedback", {
                          itemId: props.work.itemId,
                          account: props.account,
                        });
                        if (alive.current) {
                          if (result.ok) setFeedback(result.value?.text ?? "暂无审核反馈");
                          else setError(result.error.message);
                        }
                      })
                    }
                  >
                    读取审核反馈
                  </TextButton>
                  {feedback !== null && <p className={styles.hint}>{feedback}</p>}
                </div>
              </Panel>
            </>
          )}
          {tab === "pc" && (
            <Section section="pc" title="PC 同步配置" {...common}>
              <div className={styles.stack}>
                <Input
                  label="PC 作品名称"
                  value={text(sync.item_name)}
                  disabled={disabled}
                  onChange={(v) => changePc("item_name", v)}
                />
                <Input
                  label="简短介绍"
                  value={text(sync.brief)}
                  multiline
                  disabled={disabled}
                  onChange={(v) => changePc("brief", v)}
                />
                <RichEditor
                  value={text(sync.info)}
                  syncFromPe={() => text(value.info)}
                  disabled={disabled}
                  maxLength={10000}
                  onChange={(v) => changePc("info", v)}
                  upload={() => upload("richImage")}
                />
                <div className={styles.fields}>
                  <Select
                    label="PC 资源类别"
                    value={number(sync.pri_type)}
                    choices={choices?.pcTypes ?? []}
                    disabled={disabled}
                    onChange={(v) => {
                      change("sync_item_info", {
                        ...sync,
                        pri_type: v,
                        sub_type: choices?.pcSubTypes[String(v)]?.[0]?.id ?? 0,
                      });
                    }}
                  />
                  <Select
                    label="PC 具体类别"
                    value={number(sync.sub_type)}
                    choices={choices?.pcSubTypes[String(sync.pri_type)] ?? []}
                    disabled={disabled}
                    onChange={(v) => changePc("sub_type", v)}
                  />
                  <Field label="适用范围">
                    <select
                      aria-label="PC 适用范围"
                      className={styles.input}
                      value={text(sync.available_scope)}
                      disabled={disabled || !choices}
                      onChange={(e) => changePc("available_scope", e.target.value)}
                    >
                      <option value={text(sync.available_scope)}>
                        {choices?.pcScopes.find((s) => s.id === sync.available_scope)?.title ??
                          (text(sync.available_scope) || "请选择")}
                      </option>
                      {choices?.pcScopes
                        .filter((s) => s.id !== sync.available_scope)
                        .map((scope) => (
                          <option key={scope.id} value={scope.id}>
                            {scope.title}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <YesNo
                    label="包含地图"
                    value={sync.include_map === true}
                    disabled={disabled}
                    onChange={(v) => changePc("include_map", v)}
                  />
                </div>
                <Field label="PC 标签">
                  <div className={styles.checks}>
                    {choices?.pcTags.map((tag) => (
                      <label key={tag.id}>
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={Array.isArray(sync.tag) && sync.tag.includes(tag.id)}
                          onChange={(e) => {
                            const selected = Array.isArray(sync.tag) ? sync.tag : [];
                            changePc(
                              "tag",
                              e.target.checked ? [...selected, tag.id] : selected.filter((id) => id !== tag.id),
                            );
                          }}
                        />
                        {tag.title}
                      </label>
                    ))}
                  </div>
                </Field>
                <YesNo
                  label="PC 弱下架"
                  value={sync.weak_offline === true}
                  disabled={disabled}
                  onChange={(v) => changePc("weak_offline", v)}
                />
                <ReferencePicker
                  account={props.account}
                  itemId={props.work.itemId}
                  kind="pcPrerequisite"
                  label="PC 前置模组"
                  multiple
                  selected={rows(normalizePcRequirements(sync.requirement ?? [])).map((r) => ({
                    itemId: text(r.item_id),
                    name: text(r.item_name),
                  }))}
                  disabled={disabled}
                  onChange={(items) =>
                    changePc(
                      "requirement",
                      items.map((item) => ({ item_id: item.itemId, item_name: item.name })),
                    )
                  }
                />
                {sync.weak_offline === true && (
                  <Input
                    label="PC 下架原因"
                    value={text(sync.weak_offline_reason)}
                    disabled={disabled}
                    onChange={(v) => changePc("weak_offline_reason", v)}
                  />
                )}
                <ImageSlots
                  slots={choices?.pcImages ?? []}
                  channels={rows(sync.channel)}
                  disabled={disabled}
                  upload={upload}
                  platform="pc"
                  onChange={(channels) => changePc("channel", channels)}
                />
              </div>
            </Section>
          )}
        </div>
        <aside className={`${styles.stack} ${styles.sidebar}`}>
          <Panel title="当前作品">
            <dl className={styles.summary}>
              <div>
                <dt>状态</dt>
                <dd>{props.creating ? "未创建" : statusLabels[document.status]}</dd>
              </div>
              <div>
                <dt>价格</dt>
                <dd>
                  <WorkPrice
                    price={number(value.price)}
                    priceType={
                      value.price_type === "diamond" ? "diamond" : value.price_type === "point" ? "point" : "free"
                    }
                  />
                </dd>
              </div>
              <div>
                <dt>资源版本</dt>
                <dd>{document.version || "—"}</dd>
              </div>
              <div>
                <dt>发布平台</dt>
                <dd>{value.sync_pc_flag ? "PE + PC" : "PE"}</dd>
              </div>
            </dl>
            <span className={styles.hint}>
              {props.creating
                ? "所有分区将在创建时一并提交"
                : dirtyKeys.length
                  ? `${dirtyKeys.length} 项修改尚未保存`
                  : "与当前已加载详情一致"}
            </span>
          </Panel>
          <Panel title="快速定位">
            {availableTabs.map((t) => (
              <button className={styles.jump} type="button" key={t.id} onClick={() => setTab(t.id)}>
                {t.label} ›
              </button>
            ))}
          </Panel>
        </aside>
      </div>
      <div className={styles.footer}>
        <span>
          {busy
            ? "正在处理，请勿重复提交"
            : props.creating
              ? "所有分区在创建作品时一并保存"
              : "更新仅解锁当前分区；保存此分区提交局部修改，顶部保存提交已解锁分区的修改"}
        </span>
        <span>{imageChoices.length ? `已加载 ${imageChoices.length} 个 PE 图片位` : "图片位来自平台配置"}</span>
      </div>
      {cropping && (
        <ImageCropDialog
          image={cropping}
          onDone={(crop) => {
            setCropping(null);
            cropResolve.current?.(crop);
          }}
        />
      )}
      {confirm && (
        <Dialog
          title={confirm === "create" ? "确认创建作品" : confirm === "review" ? "保存并提交审核" : "放弃未保存的修改？"}
          onClose={() => !busy && setConfirm(null)}
          actions={
            <>
              <Button onClick={() => setConfirm(null)}>取消</Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  if (confirm === "create") create();
                  else if (confirm === "review") submit();
                  else {
                    const action = confirm;
                    drafts.delete(draftKey);
                    setConfirm(null);
                    if (action === "back") props.onClose();
                    else reload();
                  }
                }}
              >
                {confirm === "create" ? "确认创建" : confirm === "review" ? "确认提交审核" : "放弃修改并继续"}
              </Button>
            </>
          }
        >
          <p className={styles.hint}>
            {confirm === "create"
              ? `将在当前账号下创建「${text(value.item_name)}」，定价为 ${priceText({ ...props.work, price: number(value.price), priceType: value.price_type === "diamond" ? "diamond" : value.price_type === "point" ? "point" : "free" })}。创建后返回作品列表，不会自动提交审核。`
              : confirm === "review"
                ? `将保存「${text(value.item_name)}」的全部修改，再向网易提交审核。提交后编辑将暂时锁定。`
                : props.creating && uncertain
                  ? "上次创建可能已成功。请先到作品列表刷新核对；放弃草稿或重置不会撤销已发送的请求。"
                  : "离开后，这些修改不会写入网易平台。"}
          </p>
        </Dialog>
      )}
    </div>
  );
}
