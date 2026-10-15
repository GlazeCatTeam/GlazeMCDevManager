import { callHost, onHostEvent, type SessionSettings } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";

/** Load and save host preferences; stale reads and failed writes never replace confirmed values */
export function useSessionSettings() {
  const [settings, setSettings] = useState<SessionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const mounted = useRef(false);
  const revision = useRef(0);
  const writing = useRef(false);

  /** Fetch persisted values, ignoring a response superseded by a newer settings event */
  const reload = useCallback(async () => {
    const request = ++revision.current;
    setLoading(true);
    setError(null);
    try {
      const result = await callHost("sessionSettings.get");
      if (!mounted.current || request !== revision.current) return;
      if (result.ok) setSettings(result.value);
      else setError(result.error.message);
    } catch {
      if (mounted.current && request === revision.current) setError("无法读取会话设置，请重试");
    } finally {
      if (mounted.current && request === revision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = onHostEvent("sessionSettings.changed", (value) => {
      revision.current++;
      setSettings(value);
      setLoading(false);
      setError(null);
    });
    void reload();
    return () => {
      mounted.current = false;
      revision.current++;
      unsubscribe();
    };
  }, [reload]);

  /** Confirm persistence before moving a switch; serialize writes to avoid lost toggle updates */
  const save = async (value: SessionSettings) => {
    if (writing.current || loading || !settings) return;
    writing.current = true;
    setSaving(true);
    setError(null);
    const request = ++revision.current;
    try {
      const result = await callHost("sessionSettings.set", value);
      if (!mounted.current || request !== revision.current) return;
      if (result.ok) setSettings(result.value);
      else setError(result.error.message);
    } catch {
      if (mounted.current && request === revision.current) setError("无法保存会话设置，请重试");
    } finally {
      writing.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return { settings, error, loading, saving, reload, save };
}
