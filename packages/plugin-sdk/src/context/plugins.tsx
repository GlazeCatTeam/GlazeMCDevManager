import type { PluginSnapshot } from "@glaze/contracts";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { callHost, onHostEvent } from "./session";

interface PluginContext {
  snapshot: PluginSnapshot | null;
  loading: boolean;
  error: string;
  refresh: () => void;
}
const Context = createContext<PluginContext | null>(null);

/** Share the host's registry across the shell, appearance controls and plugin management */
export function PluginProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<PluginSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly retries registry loading
  useEffect(() => {
    let active = true;
    let changed = false;
    setLoading(true);
    const unsubscribe = onHostEvent("plugins.changed", (value) => {
      changed = true;
      setSnapshot(value);
      setError("");
    });
    void callHost("plugins.list")
      .then((result) => {
        if (!active || changed) return;
        if (!result.ok) throw new Error(result.error.message);
        setSnapshot(result.value);
        setError("");
      })
      .catch((reason: unknown) => {
        if (active && !changed) setError(reason instanceof Error ? reason.message : "插件列表读取失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  return <Context.Provider value={{ snapshot, loading, error, refresh }}>{children}</Context.Provider>;
}

/** Standalone previews may omit the host registry; production always mounts PluginProvider */
export function usePluginRegistry() {
  return useContext(Context);
}
