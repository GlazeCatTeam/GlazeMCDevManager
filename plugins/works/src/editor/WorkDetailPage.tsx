import {
  Button,
  callHost,
  Dialog,
  Notice,
  PageHeader,
  Panel,
  Tag,
  TextButton,
  useHostQuery,
  type WorkEditorDocument,
  type WorkEditorOptions,
  type WorkRecord,
  type WorkSection,
  type WorkSummary,
  type WorkValue,
  workSections,
} from "@glaze/plugin-sdk";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { priceText } from "../format";
import { statusLabels } from "../status";
import { Field, Input, number, object, rows, Select, text, YesNo } from "./fields";
import { ImageSlots, MediaSections, type UploadFile } from "./MediaSections";
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
const drafts = new Map<string, { document: WorkEditorDocument; base: WorkRecord; value: WorkRecord }>();

interface DetailProps {
  work: WorkSummary;
  account: string;
  works: WorkSummary[];
  onClose: () => void;
  onSaved: () => void;
}

/** Full-page details reuse the workbench shell and reload with the captured account */
export function WorkDetailPage(props: DetailProps) {
  const detail = useHostQuery("works.editor", { itemId: props.work.itemId, account: props.account });
  const choices = useHostQuery("works.options", { account: props.account });
  if (detail.loading)
    return (
      <div className={styles.page}>
        <PageHeader title="模组详情" subtitle="正在加载作品…" />
      </div>
    );
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
      initial={detail.data}
      choices={choices.data}
      optionsError={choices.error?.message ?? null}
      reloadOptions={choices.reload}
      reload={detail.reload}
    />
  );
}

/** An update action always names the independently saved section */
function Section({
  section,
  title,
  disabled,
  dirty,
  save,
  children,
}: {
  section: WorkSection;
  title: string;
  disabled: boolean;
  dirty: (section: WorkSection) => boolean;
  save: (section: WorkSection) => void;
  children: ReactNode;
}) {
  return (
    <Panel
      title={title}
      actions={
        <TextButton disabled={disabled || !dirty(section)} onClick={() => save(section)}>
          更新此分区
        </TextButton>
      }
    >
      {children}
    </Panel>
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
  const lock = useRef(false);
  const alive = useRef(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [confirm, setConfirm] = useState<"back" | "reload" | "review" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dirtyKeys = Object.keys(value).filter(
    (key) => JSON.stringify(value[key] ?? null) !== JSON.stringify(base[key] ?? null),
  );
  const writable = editableStatuses.has(document.status);
  const disabled = busy || !writable || uncertain;
  const sync = object(value.sync_item_info);
  const dlc = object(value.dlc_info);
  const imageChoices = choices?.peImages ?? [];
  const availableTabs = value.sync_pc_flag ? [...tabs, { id: "pc", label: "PC 同步" }] : tabs;

  useEffect(() => {
    if (JSON.stringify(base) === JSON.stringify(value)) drafts.delete(draftKey);
    else drafts.set(draftKey, { document, base, value });
  }, [draftKey, document, base, value]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
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
    if (!disabled) setValue((old) => ({ ...old, [key]: next }));
  };
  const changePc = (key: string, next: WorkValue) => change("sync_item_info", { ...sync, [key]: next });
  const dirty = (section: WorkSection) => workSections[section].some((key) => dirtyKeys.includes(key));

  /** Send only changed fields and retain all other drafts if a section is saved */
  const persist = async (section?: WorkSection): Promise<boolean> => {
    const keys = section
      ? dirtyKeys.filter((key) => (workSections[section] as readonly string[]).includes(key))
      : dirtyKeys;
    if (
      section === "basic" &&
      keys.includes("sync_pc_flag") &&
      value.sync_pc_flag === true &&
      dirtyKeys.includes("sync_item_info")
    )
      keys.push("sync_item_info");
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
    setMessage(section ? "此分区已保存到网易" : "全部修改已保存到网易");
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
    void run(async () => {
      await persist(section);
    });
  };

  /** A native file picker performs upload in the host, never from the renderer */
  const upload: UploadFile = async (kind, channelId, platform = "pe") => {
    if (lock.current || !writable || uncertain) return null;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("选择文件并上传中，请稍候…");
    try {
      const result = await callHost("works.upload", {
        itemId: props.work.itemId,
        account: props.account,
        kind,
        platform,
        ...(channelId === undefined ? {} : { channelId }),
      });
      if (!alive.current) return null;
      if (!result.ok) {
        setError(result.error.message);
        setMessage("");
        return null;
      }
      setMessage(result.value ? "文件已上传，请保存对应分区以应用到作品" : "已取消文件选择");
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
  const common = { disabled, dirty, save };
  const peType = number(value.pri_type);
  const resources = rows(value.res);
  const resource = resources[0];

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <TextButton disabled={busy} onClick={() => (dirtyKeys.length ? setConfirm("back") : props.onClose())}>
          ‹ 返回作品管理
        </TextButton>
        <span>/ 模组详情</span>
        <Tag>{statusLabels[document.status]}</Tag>
      </div>
      <PageHeader
        title={text(value.item_name) || props.work.name}
        subtitle={`资源版本 ${document.version || "—"} · ${value.sync_pc_flag ? "PE + PC" : "PE"}`}
        actions={
          <>
            <Button disabled={busy} onClick={() => (dirtyKeys.length ? setConfirm("reload") : reload())}>
              刷新
            </Button>
            <Button disabled={disabled} onClick={() => setConfirm("review")}>
              提交审核
            </Button>
            <Button variant="primary" disabled={disabled || !dirtyKeys.length} onClick={() => save()}>
              {busy ? "处理中…" : "保存"}
            </Button>
          </>
        }
      />
      {error && <Notice>{error}</Notice>}
      {message && (
        <div className={styles.success} role="status">
          {message}
        </div>
      )}
      {optionsError && (
        <Notice action={<TextButton onClick={reloadOptions}>重试</TextButton>}>平台选项加载失败：{optionsError}</Notice>
      )}
      {!writable && <Notice>当前状态只允许查看，审核结束或撤销审核后才能修改。</Notice>}
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
                    <span className={styles.mono}>{props.work.itemId}</span>
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
                    disabled={disabled}
                    onChange={(v) => change("is_domain_server_item", v ? 1 : 0)}
                  />
                  <YesNo
                    label="原创作品 *"
                    value={value.is_original === true}
                    disabled={disabled}
                    onChange={(v) => change("is_original", v)}
                  />
                </div>
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
                    disabled={disabled}
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
                    disabled={disabled}
                    onChange={(v) => change("sync_pc_flag", v)}
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
                    <Field label="关联模组">
                      <select
                        aria-label="关联模组"
                        className={styles.input}
                        value={text(value.relate_item_id)}
                        disabled={disabled}
                        onChange={(e) => change("relate_item_id", e.target.value)}
                      >
                        <option value="">请选择</option>
                        {text(value.relate_item_id) &&
                          !props.works.some((w) => w.itemId === text(value.relate_item_id)) && (
                            <option value={text(value.relate_item_id)}>{text(value.relate_item_id)}</option>
                          )}
                        {props.works
                          .filter((w) => w.itemId !== props.work.itemId)
                          .map((w) => (
                            <option key={w.itemId} value={w.itemId}>
                              {w.name}
                            </option>
                          ))}
                      </select>
                    </Field>
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
                  <Tag>
                    {value.price_type === "diamond" ? "钻石" : value.price_type === "point" ? "绿宝石" : "免费"}
                  </Tag>
                </Field>
                <p className={styles.hint}>已有作品保留原定价类型；前置模组强制免费。</p>
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
                    choices={(choices?.peTypes ?? []).filter((option) =>
                      peType === 9 ? option.id === 9 : option.id !== 9,
                    )}
                    disabled={disabled || !choices}
                    onChange={(v) => {
                      change("pri_type", v);
                      change("sub_type", choices?.peSubTypes[String(v)]?.[0]?.id ?? 0);
                      change("mod_second_type", 0);
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
                {Object.entries(choices?.recommendTags ?? {}).map(([group, options]) => (
                  <Field key={group} label={`推荐标签 · ${group === "1" ? "玩法" : group === "2" ? "主题" : group}`}>
                    <div className={styles.checks}>
                      {options.map((option) => (
                        <label key={option.id}>
                          <input
                            type="checkbox"
                            checked={Array.isArray(value.label_type_list) && value.label_type_list.includes(option.id)}
                            disabled={disabled}
                            onChange={(e) => {
                              const selected = Array.isArray(value.label_type_list) ? value.label_type_list : [];
                              change(
                                "label_type_list",
                                e.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id),
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
                    label="坐骑召唤功能 *"
                    value={value.mount_call_enabled === true}
                    disabled={disabled}
                    onChange={(v) => change("mount_call_enabled", v)}
                  />
                  <YesNo
                    label="提升版本 *"
                    value={resource?.add_version !== false}
                    disabled={disabled || !resource}
                    onChange={(v) => change("res", [{ ...resource, add_version: v }, ...resources.slice(1)])}
                  />
                </div>
                <Field label="资源文件 *">
                  <div className={styles.file}>
                    <div className={styles.stack}>
                      <strong className={styles.fileName}>{text(resource?.res_name) || "未选择资源包"}</strong>
                      <span className={styles.hint}>ZIP · 最大 2048M</span>
                    </div>
                    <div className={styles.actions}>
                      <Button
                        size="sm"
                        disabled={disabled}
                        onClick={async () => {
                          const file = await upload("resource");
                          if (file)
                            change("res", [
                              {
                                res_name: file.name,
                                res_url: file.receipt,
                                add_version: resource?.add_version !== false,
                                mc_version: Array.isArray(resource?.mc_version) ? resource.mc_version : [],
                              },
                            ]);
                        }}
                      >
                        上传 / 替换
                      </Button>
                      <TextButton tone="danger" disabled={disabled || !resource} onClick={() => change("res", [])}>
                        移除
                      </TextButton>
                    </div>
                  </div>
                </Field>
              </div>
            </Section>
          )}
          {tab === "media" && (
            <MediaSections
              value={value}
              disabled={disabled}
              change={change}
              choices={choices}
              upload={upload}
              update={save}
              dirty={dirty}
            />
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
                      changePc("pri_type", v);
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
                <dd>{statusLabels[document.status]}</dd>
              </div>
              <div>
                <dt>价格</dt>
                <dd>{priceText({ ...props.work, price: number(value.price) })}</dd>
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
              {dirtyKeys.length ? `${dirtyKeys.length} 项修改尚未保存` : "与当前已加载详情一致"}
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
        <span>{busy ? "正在处理，请勿重复提交" : "分区更新仅保存当前分区，保存按钮提交全部修改"}</span>
        <span>{imageChoices.length ? `已加载 ${imageChoices.length} 个 PE 图片位` : "图片位来自平台配置"}</span>
      </div>
      {confirm && (
        <Dialog
          title={confirm === "review" ? "保存并提交审核" : "放弃未保存的修改？"}
          onClose={() => !busy && setConfirm(null)}
          actions={
            <>
              <Button onClick={() => setConfirm(null)}>取消</Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => {
                  if (confirm === "review") submit();
                  else {
                    const action = confirm;
                    drafts.delete(draftKey);
                    setConfirm(null);
                    if (action === "back") props.onClose();
                    else reload();
                  }
                }}
              >
                {confirm === "review" ? "确认提交审核" : "放弃修改并继续"}
              </Button>
            </>
          }
        >
          <p className={styles.hint}>
            {confirm === "review"
              ? `将保存「${text(value.item_name)}」的全部修改，再向网易提交审核。提交后编辑将暂时锁定。`
              : "离开后，这些修改不会写入网易平台。"}
          </p>
        </Dialog>
      )}
    </div>
  );
}
