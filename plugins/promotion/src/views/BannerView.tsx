import { Button, Dialog, SegmentedControl, TextButton } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";
import { BannerForm } from "./BannerForm";
import { BannerHistory } from "./BannerHistory";
import styles from "./BannerWorkspace.module.css";
import { type BannerDraft, createBannerDraft } from "./banner-model";

/** Keep the draft mounted while browsing history and confirm before replacing unsaved work */
export function BannerView({ account }: { account: string }) {
  const [draft, setDraft] = useState(createBannerDraft);
  const [screen, setScreen] = useState<"form" | "history">("form");
  const [version, setVersion] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyVisited, setHistoryVisited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<BannerDraft | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    /** Let the existing host close flow protect an unsaved draft or pending operation */
    function guard(event: BeforeUnloadEvent) {
      if (draft.dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [draft.dirty, busy]);

  /** Replace only after the user has chosen to abandon the current draft */
  function replace(next: BannerDraft) {
    setDraft(next);
    setVersion((value) => value + 1);
    setScreen("form");
    setPending(null);
    setMessage("");
  }
  /** Loading a record never silently overwrites a draft */
  function openDraft(next: BannerDraft) {
    if (draft.dirty) setPending(next);
    else replace(next);
  }
  /** Show the refreshed history after one confirmed submission */
  function completed() {
    setDraft(createBannerDraft());
    setVersion((value) => value + 1);
    setHistoryVersion((value) => value + 1);
    setHistoryVisited(true);
    setScreen("history");
    setMessage("申请已提交，可在下方查看平台审核状态。");
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.toolbar}>
        <SegmentedControl
          label="轮播图工作区"
          value={screen}
          options={[
            { value: "form", label: draft.editing ? "修改申请" : "新建申请", disabled: busy },
            { value: "history", label: "申请记录", disabled: busy },
          ]}
          onChange={(value) => {
            setScreen(value);
            if (value === "history") setHistoryVisited(true);
          }}
        />
        <div className={styles.inline}>
          <span className={styles.muted}>
            {draft.dirty ? "草稿保留中 · 可随时返回继续填写" : "首页轮播推广 · 手机版 PE"}
          </span>
          {(draft.dirty || draft.editing) && (
            <TextButton disabled={busy} onClick={() => openDraft(createBannerDraft())}>
              {draft.editing ? "退出修改" : "清空草稿"}
            </TextButton>
          )}
        </div>
      </div>
      {message && (
        <p className={styles.success} role="status">
          {message}
        </p>
      )}
      <div hidden={screen !== "form"}>
        <BannerForm
          key={version}
          account={account}
          draft={draft}
          onChange={setDraft}
          onBusy={setBusy}
          onSuccess={completed}
        />
      </div>
      {historyVisited && (
        <div hidden={screen !== "history"}>
          <BannerHistory
            key={historyVersion}
            account={account}
            onEdit={(application) => openDraft(createBannerDraft(application))}
            onReuse={(application) => openDraft(createBannerDraft(application, true))}
            onNew={() => {
              setScreen("form");
              setMessage("");
            }}
          />
        </div>
      )}
      {pending && (
        <Dialog
          title="替换当前草稿？"
          onClose={() => setPending(null)}
          actions={
            <>
              <Button onClick={() => setPending(null)}>继续保留</Button>
              <Button variant="danger" onClick={() => replace(pending)}>
                放弃草稿并继续
              </Button>
            </>
          }
        >
          <p>当前填写内容尚未提交。继续后会替换这份草稿。</p>
        </Dialog>
      )}
    </div>
  );
}
