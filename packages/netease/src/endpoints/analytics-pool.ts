import type { Result } from "../errors";

/** Fill freed request slots immediately, preserving input order and stopping on fatal failures */
export async function runAnalyticsPool<T>(
  tasks: (() => Promise<Result<T>>)[],
  concurrency: number,
  stopOnError: boolean,
): Promise<Result<T>[]> {
  const results: Result<T>[] = [];
  let next = 0;
  let stopped = false;
  /** Each worker claims one task at a time; a slow neighbor never blocks the next claim */
  const work = async () => {
    while (!stopped && next < tasks.length) {
      const index = next++;
      const task = tasks[index];
      if (!task) return;
      const result = await task();
      results[index] = result;
      if (!result.ok && (stopOnError || result.error.kind === "session_expired")) stopped = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, work));
  return results;
}
