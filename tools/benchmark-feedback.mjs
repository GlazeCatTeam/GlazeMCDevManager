import { once } from "node:events";

const startArgument = process.argv.find((value) => value.startsWith("--start="))?.slice(8);
const samplesArgument = process.argv.find((value) => value.startsWith("--samples="))?.slice(10);
const fixedStart = startArgument === undefined ? undefined : Number(startArgument);
const samples = samplesArgument === undefined ? 6 : Number(samplesArgument);
if (
  (fixedStart !== undefined && (!Number.isSafeInteger(fixedStart) || fixedStart < 0)) ||
  !Number.isInteger(samples) ||
  samples < 1 ||
  samples > 10
)
  throw new Error("Use --start=<non-negative integer> and --samples=<1..10>");

// Read-only diagnostics against an already-running local Electron development instance
const targets = await fetch("http://127.0.0.1:9222/json/list", { signal: AbortSignal.timeout(5000) }).then((response) =>
  response.json(),
);
const matches = targets.filter(
  (target) =>
    target.type === "page" && target.title === "GlazeMCDevManager" && new URL(target.url).hostname === "localhost",
);
if (matches.length !== 1) throw new Error("Expected exactly one running GlazeMCDevManager development window");
const socket = new WebSocket(matches[0].webSocketDebuggerUrl);
await once(socket, "open");
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

/** Evaluate only the fixed read-only diagnostic expressions below */
function evaluate(expression) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(
      JSON.stringify({
        id,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true, timeout: 25000 },
      }),
    );
  }).then((result) => {
    if (result.exceptionDetails)
      throw new Error("Diagnostic failed inside the application; no private payload was printed");
    return result.result.value;
  });
}

try {
  for (let index = 0; index < samples; index++) {
    const start = fixedStart ?? (index === 5 ? 20 : 0);
    const result = await evaluate(`(async () => {
      const account = await window.glaze.rpc("account.current");
      if (!account.ok || !account.value) return { ok: false, reason: "no-current-account" };
      const begin = performance.now();
      const result = await window.glaze.rpc("feedback.list", { account: account.value.id, start: ${start}, span: 20 });
      const elapsedMs = Math.round((performance.now() - begin) * 10) / 10;
      if (!result.ok) return { ok: false, elapsedMs, errorKind: result.error.kind };
      return { ok: true, elapsedMs, total: result.value.total, rows: result.value.entries.length,
        bytes: new TextEncoder().encode(JSON.stringify(result.value)).byteLength,
        images: result.value.entries.reduce((sum, row) => sum + row.images.length, 0),
        logs: result.value.entries.filter(row => row.log).length };
    })()`);
    console.log(
      JSON.stringify({
        sample: index + 1,
        operation: start > 0 ? "next-page" : index === 0 ? "first-read" : "refresh",
        start,
        ...result,
      }),
    );
    if (!result.ok) break;
  }
} finally {
  socket.close();
}
