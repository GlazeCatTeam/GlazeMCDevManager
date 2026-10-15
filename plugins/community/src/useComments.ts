import { type CommentListParams, type CommentPage, callHost, type RpcError } from "@glaze/plugin-sdk";
import { useEffect, useState } from "react";

interface CommentQuery {
  data: CommentPage | null;
  error: RpcError | null;
  loading: boolean;
}

/** Keep successful data during refresh and ignore responses after the keyed panel unmounts */
export function useComments(params: CommentListParams, revision: number): CommentQuery {
  const [query, setQuery] = useState<CommentQuery>({ data: null, error: null, loading: true });
  const paramsKey = JSON.stringify(params);
  useEffect(() => {
    let active = true;
    void revision;
    setQuery((current) => ({ ...current, error: null, loading: true }));
    callHost("comments.list", JSON.parse(paramsKey))
      .then((result) => {
        if (!active) return;
        setQuery((current) =>
          result.ok
            ? { data: result.value, error: null, loading: false }
            : { ...current, error: result.error, loading: false },
        );
      })
      .catch(() => {
        if (active)
          setQuery((current) => ({
            ...current,
            error: { kind: "internal", message: "评论请求失败，请重试" },
            loading: false,
          }));
      });
    return () => {
      active = false;
    };
  }, [paramsKey, revision]);
  return query;
}
