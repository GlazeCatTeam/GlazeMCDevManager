import type { AccountSummary, RpcError, RpcMethod, RpcMethods, RpcResult } from "@glaze/contracts";
import { callHost, onHostEvent, onHostWrite } from "../context/session";
import { clearQueryCaches } from "./query-cache";

export interface QuerySnapshot {
  data: unknown;
  error: RpcError | null;
  loading: boolean;
  /** Time of the last successful result; 0 before the first one */
  updatedAt: number;
}

interface Entry {
  method: RpcMethod;
  params: unknown;
  snapshot: QuerySnapshot;
  expires: number;
  ttl: number;
  listeners: Set<() => void>;
  pending?: Promise<void>;
}

export const DEFAULT_QUERY_TTL = 30_000;
const CAPACITY = 200;
const EMPTY: QuerySnapshot = { data: null, error: null, loading: false, updatedAt: 0 };
const entries = new Map<string, Entry>();
let wired = false;

/** Session identity for cache keys: a different account, a new login or expiry never reuses data */
export function sessionKeyOf(current: AccountSummary | null): string {
  return JSON.stringify([current?.id ?? null, current?.lastLoginAt ?? null, current?.status === "expired"]);
}

/** Stable key for one read of one method with exact parameters under one session */
export function hostQueryKey(sessionKey: string, method: RpcMethod, paramsKey: string): string {
  return JSON.stringify([sessionKey, method, paramsKey]);
}

/** Drop old unused entries once the cache grows past its bound */
function prune(keep: string): void {
  for (const [key, entry] of entries) {
    if (entries.size <= CAPACITY) break;
    if (key !== keep && !entry.listeners.size && !entry.pending) entries.delete(key);
  }
}

/** Replace a snapshot and notify subscribers; identities stay stable between updates */
function publish(entry: Entry, snapshot: QuerySnapshot): void {
  entry.snapshot = snapshot;
  for (const notify of entry.listeners) notify();
}

/** Clear everything after the user clears local caches; mounted queries reload */
export function clearHostQueries(): void {
  clearQueryCaches();
  for (const [key, entry] of entries) {
    if (!entry.listeners.size) {
      entries.delete(key);
      continue;
    }
    entry.expires = 0;
    delete entry.pending;
    publish(entry, EMPTY);
    void readHostQuery(key, entry.method, entry.params);
  }
}

/** Mark matching reads stale and refresh the ones on screen in the background, keeping their data */
export function expireHostQueries(match: (method: RpcMethod) => boolean = () => true): void {
  for (const [key, entry] of entries) {
    if (!match(entry.method)) continue;
    entry.expires = 0;
    if (entry.listeners.size) void readHostQuery(key, entry.method, entry.params, { force: true });
  }
}

/** Subscribe once to host signals that invalidate cached reads */
function wire(): void {
  if (wired) return;
  wired = true;
  try {
    onHostEvent("cache.cleared", clearHostQueries);
  } catch {
    // Outside the app window there is no host to clear caches
  }
  onHostWrite((method) => {
    const module = method.split(".")[0];
    expireHostQueries((read) => read.split(".")[0] === module);
  });
}

/** Get or create the entry for a key */
function entryFor(key: string, method: RpcMethod, params: unknown): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { method, params, snapshot: EMPTY, expires: 0, ttl: DEFAULT_QUERY_TTL, listeners: new Set() };
    entries.set(key, entry);
    prune(key);
  }
  return entry;
}

/** Current snapshot for a key without creating it */
export function hostQuerySnapshot(key: string): QuerySnapshot {
  return entries.get(key)?.snapshot ?? EMPTY;
}

/** Listen to one key; the entry is kept while anyone listens */
export function subscribeHostQuery(key: string, method: RpcMethod, params: unknown, notify: () => void): () => void {
  const entry = entryFor(key, method, params);
  entry.listeners.add(notify);
  return () => {
    entry.listeners.delete(notify);
  };
}

/** Read through the cache: fresh data skips the network, stale data stays visible while it refreshes */
export function readHostQuery<M extends RpcMethod>(
  key: string,
  method: M,
  params: RpcMethods[M]["params"] | unknown,
  options: { force?: boolean; ttl?: number } = {},
): Promise<void> {
  wire();
  const entry = entryFor(key, method, params);
  if (options.ttl !== undefined) entry.ttl = options.ttl;
  if (entry.pending) return entry.pending;
  if (!options.force && entry.expires > Date.now()) return Promise.resolve();
  publish(entry, { ...entry.snapshot, loading: true, error: null });
  const pending: Promise<void> = Promise.resolve()
    .then(() => callHost(method, (params ?? undefined) as RpcMethods[M]["params"]))
    .catch(
      (reason: unknown): RpcResult<RpcMethods[M]["result"]> => ({
        ok: false,
        error: { kind: "internal", message: reason instanceof Error ? reason.message : "查询失败，请重试" },
      }),
    )
    .then((result) => {
      // A cache clear during flight detaches this request
      if (entry.pending !== pending) return;
      delete entry.pending;
      entry.expires = result.ok ? Date.now() + entry.ttl : 0;
      publish(entry, {
        data: result.ok ? result.value : entry.snapshot.data,
        error: result.ok ? null : result.error,
        loading: false,
        updatedAt: result.ok ? Date.now() : entry.snapshot.updatedAt,
      });
    });
  entry.pending = pending;
  return pending;
}
