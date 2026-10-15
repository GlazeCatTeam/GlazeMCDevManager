import { type AccountSummary, callHost, type LoginStep, onHostEvent, type RpcResult } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";

export type LoginPhase =
  | { kind: "idle" }
  | { kind: "working"; step: LoginStep }
  | { kind: "done"; account: AccountSummary };

/** Steps of each login kind, for the progress bar */
export const windowSteps: readonly LoginStep[] = ["window", "verify"];
export const cookieSteps: readonly LoginStep[] = ["verify"];

/** Run a login in the main process and track its progress and error message */
export function useLogin() {
  const [phase, setPhase] = useState<LoginPhase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  // The main process reports each step while a login runs
  useEffect(
    () =>
      onHostEvent("login.progress", ({ step }) =>
        setPhase((current) => (current.kind === "working" ? { kind: "working", step } : current)),
      ),
    [],
  );

  /** Start a login; a cancelled login quietly returns to idle */
  const run = async (firstStep: LoginStep, login: () => Promise<RpcResult<AccountSummary>>) => {
    setError(null);
    setPhase({ kind: "working", step: firstStep });
    const result = await login();
    if (result.ok) {
      setPhase({ kind: "done", account: result.value });
      return;
    }
    setPhase({ kind: "idle" });
    if (result.error.kind !== "login_cancelled") {
      setError(result.error.message);
    }
  };

  const loginWithWindow = () => run("window", () => callHost("account.loginWithWindow"));
  const loginWithCookie = (cookie: string) => run("verify", () => callHost("account.loginWithCookie", { cookie }));
  const cancel = () => void callHost("account.cancelLogin");

  return { phase, error, loginWithWindow, loginWithCookie, cancel };
}
