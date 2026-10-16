import {
  Button,
  callHost,
  EmptyState,
  Notice,
  remoteImageUrl,
  SearchField,
  Tag,
  TextButton,
  useHostQuery,
} from "@glaze/plugin-sdk";
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";
import { dateText, QueryMessage } from "../shared";
import { BannerImage } from "./BannerImage";
import { BannerPreview } from "./BannerPreview";
import styles from "./BannerWorkspace.module.css";
import { type BannerDraft, type BannerStep, bannerCopyFields } from "./banner-model";

const steps = ["选择作品与日期", "准备宣传内容", "核对提交"];
const workStates: Record<string, string> = {
  online: "已上架",
  init: "草稿",
  reviewing: "审核中",
  accept: "待上架",
  reject: "未通过",
  offline: "已下架",
  self_test: "自测中",
  appoint_online: "定时上架",
};

/** Read a visible work's icon through the existing image proxy, with a text fallback */
function WorkIconImage({ account, itemId, name }: { account: string; itemId: string; name: string }) {
  const detail = useHostQuery("works.get", { account, itemId });
  const src = remoteImageUrl(detail.data?.iconUrl);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && failedSrc !== src ? (
    <img src={src} alt="" draggable={false} onError={() => setFailedSrc(src)} />
  ) : (
    name.slice(0, 1)
  );
}

/** Defer detail requests until the icon enters the visible list area */
function WorkIcon({ account, itemId, name }: { account: string; itemId: string; name: string }) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={element} className={styles.workIcon} aria-hidden="true">
      {visible ? <WorkIconImage account={account} itemId={itemId} name={name} /> : name.slice(0, 1)}
    </span>
  );
}

/** Guide one draft through selection, preparation and an explicit final submission */
export function BannerForm({
  account,
  draft,
  onChange,
  onBusy,
  onSuccess,
}: {
  account: string;
  draft: BannerDraft;
  onChange: Dispatch<SetStateAction<BannerDraft>>;
  onBusy: (busy: boolean) => void;
  onSuccess: () => void;
}) {
  const dates = useHostQuery("promotion.dates", { account });
  const works = useHostQuery("works.list", { account, platform: "pe" });
  const { fields, editing, step } = draft;
  const [search, setSearch] = useState("");
  const [copyTab, setCopyTab] = useState<(typeof bannerCopyFields)[number]["key"]>("feature");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const selectedWork = works.data?.find((work) => work.itemId === fields.itemId);
  const workName = selectedWork?.name ?? (editing?.itemId === fields.itemId ? editing.itemName : "尚未选择作品");
  const filtered = [...(works.data ?? [])]
    .filter((work) => `${work.name} ${work.itemId}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(b.status === "online") - Number(a.status === "online"));
  const originalDate = Boolean(editing && editing.startTime === fields.startTime);
  const dateReady = Boolean(
    dates.data?.dates.some((date) => date.time === fields.startTime && date.allowed) || originalDate,
  );
  const workReady = Boolean(selectedWork || (editing && fields.itemId === editing.itemId));
  const selectionReady = workReady && dateReady;
  const loading = dates.loading || works.loading;
  const loadError = Boolean(dates.error || works.error);
  const busy = saving || uploading;
  const copy = bannerCopyFields.find((field) => field.key === copyTab) ?? bannerCopyFields[0];
  const longCopy = bannerCopyFields.find(({ key }) => fields[key].length > 20000);
  const missing = !workReady
    ? "请先选择一个推广作品"
    : !dateReady
      ? "请选择一个可申请日期"
      : step >= 2 && !fields.imageUrl
        ? "请选择宣传图，并完成裁剪上传"
        : longCopy
          ? `${longCopy.label}超过 20000 字，请缩短后继续`
          : "";
  const blocked =
    busy ||
    loading ||
    loadError ||
    !selectionReady ||
    (step >= 2 && (!fields.imageUrl || Boolean(longCopy))) ||
    uncertain;
  // biome-ignore lint/correctness/useExhaustiveDependencies: A step change resets the scroll position and keyboard focus
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  /** Preserve every other field when moving backward or changing one part of the draft */
  function update(patch: Partial<BannerDraft["fields"]>) {
    onChange((current) => ({ ...current, fields: { ...current.fields, ...patch }, dirty: true }));
    setError("");
  }
  /** Keep earlier steps accessible without clearing entered content */
  function go(next: BannerStep) {
    if (!busy) onChange((current) => ({ ...current, step: next }));
  }
  /** Lock navigation during native selection, crop confirmation and upload */
  function uploadBusy(value: boolean) {
    setUploading(value);
    onBusy(value);
  }
  /** Submit the visible review once; preserve the draft and show errors inline */
  async function submit() {
    if (pending.current || blocked) return;
    pending.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    try {
      const result = await callHost("promotion.saveBanner", {
        ...fields,
        account,
        ...(editing ? { applicationId: editing.id } : {}),
      });
      if (result.ok) onSuccess();
      else {
        const unknown =
          ["network", "timeout", "parse", "internal"].includes(result.error.kind) ||
          result.error.message.startsWith("网易平台数据解析失败");
        setUncertain(unknown);
        setError(
          unknown ? `${result.error.message}。结果尚未确认，请查看申请记录核对，暂不重复提交。` : result.error.message,
        );
      }
    } catch {
      setUncertain(true);
      setError("结果尚未确认，请查看申请记录核对，暂不重复提交。");
    } finally {
      pending.current = false;
      setSaving(false);
      onBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-label={editing ? "修改轮播图申请" : "新建轮播图申请"}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{editing ? "修改已有申请" : "PE 首页轮播推广"}</span>
          <h2 ref={heading} tabIndex={-1}>
            {steps[step - 1]}
          </h2>
        </div>
        <Button
          size="xs"
          disabled={busy || loading}
          onClick={() => {
            dates.reload();
            works.reload();
          }}
        >
          刷新作品与日期
        </Button>
      </header>
      <ol className={styles.steps} aria-label="申请步骤">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              aria-current={step === index + 1 ? "step" : undefined}
              disabled={busy || index + 1 > step}
              onClick={() => go((index + 1) as BannerStep)}
            >
              <span>{index + 1 < step ? "✓" : index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <div ref={content} className={styles.body}>
        {(dates.error || (!dates.data && dates.loading)) && <QueryMessage query={dates} />}
        {(works.error || (!works.data && works.loading)) && <QueryMessage query={works} />}
        {step === 1 && (
          <div className={styles.selectionGrid}>
            <div className={styles.workSection}>
              <div className={styles.sectionTitle}>
                <h3>推广哪个作品？</h3>
                <span className={styles.muted}>{works.data ? `${filtered.length} 个作品` : "正在加载"}</span>
              </div>
              <SearchField
                value={search}
                onChange={setSearch}
                label="搜索推广作品"
                placeholder="输入作品名称或 ID，直接点选"
              />
              <div className={styles.workList} role="radiogroup" aria-label="推广作品">
                {filtered.map((work) => (
                  <label key={work.itemId} className={styles.workOption} data-selected={fields.itemId === work.itemId}>
                    <input
                      type="radio"
                      name="banner-work"
                      checked={fields.itemId === work.itemId}
                      onChange={() => update({ itemId: work.itemId })}
                    />
                    <WorkIcon
                      key={`${account}:${work.itemId}`}
                      account={account}
                      itemId={work.itemId}
                      name={work.name}
                    />
                    <span className={styles.workInfo}>
                      <strong>{work.name}</strong>
                      <small>ID {work.itemId}</small>
                    </span>
                    <span className={styles.workState}>{workStates[work.status] ?? "其他状态"}</span>
                  </label>
                ))}
                {works.data && !filtered.length && (
                  <EmptyState
                    title={works.data.length ? "没有找到匹配的作品" : "暂无作品"}
                    hint={works.data.length ? "换个关键词试试，或使用作品 ID 搜索" : "发布作品后，可回到这里申请推广"}
                  />
                )}
              </div>
              <div className={styles.chosen}>
                <span className={styles.muted}>已选择</span>
                <strong>{workName}</strong>
                {selectedWork && <small>最终申请资格由平台审核</small>}
              </div>
            </div>
            <div className={styles.dateSection}>
              <div className={styles.sectionTitle}>
                <h3>希望哪天开始展示？</h3>
                <span className={styles.muted}>北京时间</span>
              </div>
              <p className={styles.muted}>点选一个可申请日期。不可申请的日期会说明原因。</p>
              <div className={styles.dates} role="radiogroup" aria-label="申请日期">
                {editing && !dates.data?.dates.some((date) => date.time === editing.startTime) && (
                  <label className={styles.dateOption} data-selected={originalDate}>
                    <input
                      type="radio"
                      name="banner-date"
                      checked={originalDate}
                      onChange={() => update({ startTime: editing.startTime })}
                    />
                    <span>
                      <strong>{dateText(editing.startTime)}</strong>
                      <small>原申请日期 · 可保留</small>
                    </span>
                  </label>
                )}
                {dates.data?.dates.map((date) => {
                  const allowed = date.allowed || editing?.startTime === date.time;
                  return (
                    <label
                      key={date.time}
                      className={styles.dateOption}
                      data-selected={fields.startTime === date.time}
                      data-disabled={!allowed}
                    >
                      <input
                        type="radio"
                        name="banner-date"
                        disabled={!allowed}
                        checked={fields.startTime === date.time}
                        onChange={() => update({ startTime: date.time })}
                      />
                      <span>
                        <strong>{dateText(date.time)}</strong>
                        <small>
                          {new Intl.DateTimeFormat("zh-CN", { weekday: "long", timeZone: "Asia/Shanghai" }).format(
                            new Date(date.time * 1000),
                          )}{" "}
                          ·{" "}
                          {date.allowed
                            ? date.recent
                              ? "可申请 · 近期有申请记录"
                              : "可申请"
                            : editing?.startTime === date.time
                              ? "原申请日期 · 可保留"
                              : date.reason || "暂不可申请"}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
              {dates.data?.dates.length === 0 && !editing && (
                <EmptyState title="暂时没有可申请日期" hint="可稍后刷新，已选作品会保留" />
              )}
            </div>
          </div>
        )}
        {step === 2 && (
          <>
            <div className={styles.context}>
              <strong>{workName}</strong>
              <span>{dateText(fields.startTime)} 开始展示</span>
              <TextButton disabled={busy} onClick={() => go(1)}>
                更改作品或日期
              </TextButton>
            </div>
            <div className={styles.contentGrid}>
              <BannerImage
                account={account}
                url={fields.imageUrl}
                name={draft.imageName}
                onBusy={uploadBusy}
                onChange={(url, name) => {
                  onChange((current) => ({
                    ...current,
                    fields: { ...current.fields, imageUrl: url },
                    imageName: name,
                    dirty: true,
                  }));
                  setError("");
                }}
              />
              <div className={styles.copySection}>
                <div className={styles.sectionTitle}>
                  <h3>向审核人员介绍作品</h3>
                  <span className={styles.muted}>文案可选</span>
                </div>
                <div className={styles.copyTabs} role="tablist" aria-label="推广文案">
                  {bannerCopyFields.map((field) => (
                    <button
                      id={`copy-tab-${field.key}`}
                      role="tab"
                      aria-selected={copyTab === field.key}
                      aria-controls="banner-copy-panel"
                      tabIndex={copyTab === field.key ? 0 : -1}
                      key={field.key}
                      type="button"
                      onClick={() => setCopyTab(field.key)}
                      onKeyDown={(event) => {
                        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                        event.preventDefault();
                        const index = bannerCopyFields.findIndex((item) => item.key === copyTab);
                        const next = bannerCopyFields[(index + (event.key === "ArrowRight" ? 1 : 3)) % 4];
                        if (next) {
                          setCopyTab(next.key);
                          document.getElementById(`copy-tab-${next.key}`)?.focus();
                        }
                      }}
                    >
                      {field.label}
                      {fields[field.key].trim() && <span aria-hidden="true"> ·</span>}
                    </button>
                  ))}
                </div>
                <div
                  id="banner-copy-panel"
                  role="tabpanel"
                  aria-labelledby={`copy-tab-${copy.key}`}
                  className={styles.copyEditor}
                >
                  <p id="banner-copy-hint" className={styles.muted}>
                    {copy.hint}
                  </p>
                  <label htmlFor="banner-copy" className={styles.srOnly}>
                    {copy.label}
                  </label>
                  <textarea
                    id="banner-copy"
                    aria-describedby="banner-copy-hint"
                    value={fields[copy.key]}
                    placeholder={copy.placeholder}
                    onChange={(event) => update({ [copy.key]: event.target.value })}
                    spellCheck={false}
                  />
                  <div className={styles.sectionTitle}>
                    <TextButton
                      disabled={Boolean(fields[copy.key].trim())}
                      onClick={() => update({ [copy.key]: copy.example })}
                    >
                      填入写作提纲
                    </TextButton>
                    <span className={styles.muted}>{fields[copy.key].length} / 20000</span>
                  </div>
                </div>
                <p className={styles.muted}>只填写与本次推广相关的内容；切换项目会保留文字。提纲仅填入空白项。</p>
              </div>
            </div>
          </>
        )}
        {step === 3 && (
          <div className={styles.reviewGrid}>
            <div>
              <div className={styles.sectionTitle}>
                <h3>宣传图</h3>
                <TextButton disabled={busy} onClick={() => go(2)}>
                  修改宣传内容
                </TextButton>
              </div>
              <BannerPreview url={fields.imageUrl} alt="待提交的宣传图" />
              <dl className={styles.summary}>
                <div>
                  <dt>推广作品</dt>
                  <dd>{workName}</dd>
                </div>
                <div>
                  <dt>作品 ID</dt>
                  <dd>{fields.itemId}</dd>
                </div>
                <div>
                  <dt>展示日期</dt>
                  <dd>{dateText(fields.startTime)}（北京时间）</dd>
                </div>
                <div>
                  <dt>推广位置</dt>
                  <dd>PE 首页轮播图</dd>
                </div>
              </dl>
              <TextButton disabled={busy} onClick={() => go(1)}>
                修改作品与日期
              </TextButton>
            </div>
            <div>
              <div className={styles.sectionTitle}>
                <h3>推广文案</h3>
                <Tag>{bannerCopyFields.filter(({ key }) => fields[key].trim()).length} 项已填写</Tag>
              </div>
              {bannerCopyFields.map(({ key, label }) => (
                <div key={key} className={styles.reviewCopy}>
                  <h4>{label}</h4>
                  <p>{fields[key].trim() || "未填写"}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {error && (
        <div className={styles.error} role="alert">
          <Notice>{error}</Notice>
        </div>
      )}
      <footer className={styles.footer}>
        <div className={styles.footerMessage} aria-live="polite">
          {saving
            ? "正在提交，请稍候…"
            : uploading
              ? "图片处理中，请稍候…"
              : uncertain
                ? "请到申请记录核对提交结果"
                : loadError
                  ? "作品或日期加载失败，请重试后继续"
                  : loading
                    ? "正在更新作品与日期…"
                    : missing ||
                      (step === 3
                        ? "请核对以上信息，点击后将提交至网易平台"
                        : step === 1
                          ? "作品和日期已选择，可以继续"
                          : "宣传内容已准备好，下一步核对申请")}
        </div>
        <div className={styles.inline}>
          {step > 1 && (
            <Button disabled={busy} onClick={() => go((step - 1) as BannerStep)}>
              上一步
            </Button>
          )}
          {step < 3 ? (
            <Button variant="primary" disabled={blocked} onClick={() => go((step + 1) as BannerStep)}>
              {step === 1 ? "下一步：准备宣传内容" : "下一步：核对申请"}
            </Button>
          ) : (
            <Button variant="primary" disabled={blocked} onClick={() => void submit()}>
              {saving ? "正在提交…" : editing ? "确认并提交修改" : "确认并提交申请"}
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
}
