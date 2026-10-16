import { type HostQuery, type RankEntry, type RpcMethods, useHostQuery, useSession } from "@glaze/plugin-sdk";
import { useCallback, useEffect } from "react";
import { HOME_TTL, type HomeMethod, warmImages } from "./home-query";

/** Cached home reads pinned to the current account, with shared intent prefetch */
export function useHomeQuery<M extends HomeMethod>(
  method: M,
  params?: RpcMethods[M]["params"],
): HostQuery<RpcMethods[M]["result"]> & { prefetch: (next: RpcMethods[M]["params"]) => void } {
  const { current } = useSession();
  const account = current?.id;
  // Pin requests to the account they were issued for so a switch mid-flight cannot mix data.
  // A different board must never appear under the newly selected tab, so rankings show placeholders instead
  const query = useHostQuery(method, { ...params, account } as RpcMethods[M]["params"], {
    ttl: HOME_TTL,
    keepPrevious: !method.startsWith("rank."),
  });
  const { data } = query;
  useEffect(() => {
    if (!data) return;
    if (method === "rank.list") warmImages(data as RankEntry[]);
    if (method === "rank.page") warmImages((data as RpcMethods["rank.page"]["result"]).items);
  }, [data, method]);
  const { prefetch: warm } = query;
  const prefetch = useCallback(
    (next: RpcMethods[M]["params"]) => warm({ ...next, account } as RpcMethods[M]["params"]),
    [warm, account],
  );
  return { ...query, prefetch };
}
