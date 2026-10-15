import {
  isWorkOperationParams,
  type WorkOperationMethod,
  type WorkOperationParams,
  type WorkOperationResult,
  workOperationMethods,
} from "@glaze/contracts";
import { performWorkOperation } from "@glaze/netease";
import type { SessionManager } from "../session/session-manager";
import { CapabilityError } from "./errors";

/** Serialize list writes per account/work and recheck the selected account immediately before sending */
export function createWorkOperationHandlers(sessions: Pick<SessionManager, "current" | "request">) {
  const pending = new Set<string>();
  const run = async (method: WorkOperationMethod, params: WorkOperationParams): Promise<WorkOperationResult> => {
    if (!isWorkOperationParams(method, params)) throw new CapabilityError("validation", "作品操作参数无效");
    const checkAccount = () => {
      if (sessions.current()?.id !== params.account)
        throw new CapabilityError("account_changed", "账号已切换，请重新打开作品");
    };
    checkAccount();
    const key = JSON.stringify([params.account, params.itemId]);
    if (pending.has(key)) throw new CapabilityError("validation", "该作品正在操作中，请等待结果");
    pending.add(key);
    try {
      return await sessions.request(params.account, (session) =>
        performWorkOperation(session, method, params, checkAccount),
      );
    } finally {
      pending.delete(key);
    }
  };
  return Object.fromEntries(
    workOperationMethods.map((method) => [method, (params: WorkOperationParams) => run(method, params)]),
  ) as Record<WorkOperationMethod, (params: WorkOperationParams) => Promise<WorkOperationResult>>;
}
