import { Button, callHost, type McpDraft, Notice, onHostEvent, useNavigation } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkAiDraftEditor } from "./editor/WorkDetailPage";

/** Open the selected AI draft without switching accounts or touching the ordinary editor draft */
export function McpDraftPage({ id }: { id: string }) {
  const { navigate } = useNavigation();
  const [draft, setDraft] = useState<McpDraft | null>(null);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const shownRevision = useRef<number | null>(null);
  const sequence = useRef(0);
  const reload = useCallback(
    async (force = false) => {
      const current = ++sequence.current;
      try {
        const result = await callHost("mcp.snapshot");
        if (current !== sequence.current) return;
        if (!result.ok) throw new Error(result.error.message);
        const selected = result.value.drafts.find((entry) => entry.id === id);
        if (!selected) throw new Error("AI 草稿不存在");
        if (force || shownRevision.current === null || shownRevision.current === selected.revision) {
          shownRevision.current = selected.revision;
          setDraft(selected);
          setChanged(false);
        } else {
          setChanged(true);
          setDraft((previous) => (previous ? { ...previous, locked: selected.locked } : selected));
        }
        setError("");
      } catch (caught) {
        if (current === sequence.current) setError(caught instanceof Error ? caught.message : "读取 AI 草稿失败");
      }
    },
    [id],
  );
  useEffect(() => {
    void reload();
    const off = onHostEvent("mcp.changed", () => {
      void reload();
    });
    return () => {
      sequence.current++;
      off();
    };
  }, [reload]);
  const close = () => navigate("glaze.settings/settings", { category: "ai" });
  if (error)
    return (
      <>
        <Notice>{error}</Notice>
        <Button
          onClick={() => {
            void reload();
          }}
        >
          重试
        </Button>
        <Button onClick={close}>返回 AI 接入</Button>
      </>
    );
  if (!draft) return <Notice>正在读取 AI 草稿…</Notice>;
  return (
    <>
      {changed && (
        <Notice>AI 草稿已在其他位置更新，当前输入已保留。请先检查并使用编辑器的「刷新」读取最新版本。</Notice>
      )}
      <WorkAiDraftEditor
        draft={draft}
        onClose={close}
        onSaved={() => {
          void reload(true);
        }}
      />
    </>
  );
}
