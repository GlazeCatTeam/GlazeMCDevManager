import { useSession } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";

/** Remember small account-local filter choices, validating persisted values before restoring them */
export function useAnalysisPreference<T extends string | number>(name: string, initial: T, allowed?: readonly T[]) {
  const { current } = useSession();
  const key = current ? `glaze:analytics:view:v1:${current.id}:${name}` : null;
  const [value, setValue] = useState<T>(() => {
    if (!key) return initial;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      const valid = typeof saved === typeof initial && (typeof saved !== "number" || Number.isFinite(saved));
      if (valid && (!allowed || allowed.includes(saved as T))) return saved as T;
    } catch {
      // An unavailable or damaged preference must not block the page
    }
    return initial;
  });
  useEffect(() => {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Filters remain usable even when local persistence is unavailable
    }
  }, [key, value]);
  return [value, setValue] as const;
}
