import { callHost, onHostEvent, type RpcResult, type UpdateState } from "@glaze/plugin-sdk";
import { useCallback, useEffect, useState } from "react";

/** Follow the host's update service; progress and results arrive as update.changed events */
export function useAppUpdate() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision retries a failed read
  useEffect(() => {
    let active = true;
    let changed = false;
    const unsubscribe = onHostEvent("update.changed", (value) => {
      changed = true;
      setState(value);
      setError("");
    });
    void callHost("update.state").then((result) => {
      if (!active || changed) return;
      if (result.ok) {
        setState(result.value);
        setError("");
      } else setError(result.error.message);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  /** Run a host action and keep its returned state; failures are reported to the caller */
  const run = useCallback(async (action: () => Promise<RpcResult<UpdateState>>) => {
    const result = await action();
    if (!result.ok) throw new Error(result.error.message);
    setState(result.value);
  }, []);

  const check = useCallback(() => run(() => callHost("update.check")), [run]);
  const setAutoCheck = useCallback(
    (enabled: boolean) => run(() => callHost("update.setAutoCheck", { enabled })),
    [run],
  );
  const install = useCallback(async () => {
    const result = await callHost("update.install");
    if (!result.ok) throw new Error(result.error.message);
  }, []);

  return { state, error, reload, check, setAutoCheck, install };
}
