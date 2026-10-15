import type { FeedbackListParams, FeedbackPageData, RpcResult } from "@glaze/plugin-sdk";

type LoadFeedback = (params: FeedbackListParams) => Promise<RpcResult<FeedbackPageData>>;

/** Share only in-flight reads within one mounted page; every later refresh requests fresh data */
export function createFeedbackLoader(load: LoadFeedback): LoadFeedback {
  const pending = new Map<string, ReturnType<LoadFeedback>>();
  return (params) => {
    const key = JSON.stringify([params.account, params.start, params.span, params.type, params.search]);
    const existing = pending.get(key);
    if (existing) return existing;
    const request = Promise.resolve()
      .then(() => load(params))
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
