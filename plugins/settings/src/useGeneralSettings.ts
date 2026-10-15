import { callHost, type GeneralSettings, type GeneralState, onHostEvent } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";

/** Load native-backed preferences while the general category is visible */
export function useGeneralSettings(enabled: boolean) {
  const [state, setState] = useState<GeneralState | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [readFailed, setReadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const writing = useRef(false);
  const reload = useCallback(() => {
    if (!writing.current) setRevision((value) => value + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision retries the host read and refreshes native startup status
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let changed = false;
    setBusy(true);
    setStatus("正在读取通用设置…");
    const unsubscribe = onHostEvent("general.changed", (value) => {
      changed = true;
      setState(value);
      setReadFailed(false);
    });
    window.addEventListener("focus", reload);
    void callHost("general.get")
      .then((result) => {
        if (!active || changed) return;
        if (!result.ok) throw new Error(result.error.message);
        setState(result.value);
        setReadFailed(false);
        setStatus("");
      })
      .catch((error: unknown) => {
        if (!active || changed) return;
        setState(null);
        setReadFailed(true);
        setStatus(`读取通用设置失败：${error instanceof Error ? error.message : "请重试"}`);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("focus", reload);
    };
  }, [enabled, revision, reload]);

  /** Serialize native writes and refresh actual state after a failed save */
  const save = useCallback(async (value: GeneralSettings) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setStatus("正在保存通用设置…");
    try {
      const result = await callHost("general.set", value);
      if (!result.ok) throw new Error(result.error.message);
      setState(result.value);
      setReadFailed(false);
      setStatus("通用设置已保存；启动页面在下次启动时生效。");
    } catch (error) {
      setStatus(`保存通用设置失败：${error instanceof Error ? error.message : "请重试"}`);
      try {
        const actual = await callHost("general.get");
        if (!actual.ok) throw new Error(actual.error.message);
        setState(actual.value);
      } catch {
        setState(null);
        setReadFailed(true);
      }
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }, []);

  return { state, busy, status, readFailed, reload, save };
}
