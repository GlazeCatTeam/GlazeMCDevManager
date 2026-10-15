import { once } from "node:events";
import { readFile } from "node:fs/promises";

// Observational diagnostics only; application input is performed separately through Computer Use
const mode = process.argv[2] ?? "read";
const expressions = {
  trace: () => "",
  install: () => readFile(new URL("./feedback-ui-probe.js", import.meta.url), "utf8"),
  read: () => "globalThis.__glazeFeedbackProbe?.read() ?? {installed:false}",
  dispose: () => "globalThis.__glazeFeedbackProbe?.dispose(); ({disposed:true})",
  scroll: () => "globalThis.__glazeFeedbackProbe?.begin('scroll'); ({started:true})",
  imageIndex: () =>
    `(async()=>{const a=await window.glaze.rpc('account.current'); if(!a.ok||!a.value)return null; const r=await window.glaze.rpc('feedback.list',{account:a.value.id,start:0,span:20}); return r.ok ? {indexes:r.value.entries.flatMap((e,i)=>e.images.length?[i]:[])}:null;})()`,
};
if (!Object.hasOwn(expressions, mode)) throw new Error("Use install, read, dispose, scroll or imageIndex");
const targets = await fetch("http://127.0.0.1:9222/json/list", { signal: AbortSignal.timeout(5000) }).then((response) =>
  response.json(),
);
const matches = targets.filter(
  (target) =>
    target.title === "GlazeMCDevManager" && target.type === "page" && new URL(target.url).hostname === "localhost",
);
if (matches.length !== 1) throw new Error("Expected one running development application");
const socket = new WebSocket(matches[0].webSocketDebuggerUrl);
await once(socket, "open");
try {
  if (mode === "trace") {
    const totals = {};
    let finish;
    const complete = new Promise((resolve) => {
      finish = resolve;
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === "Tracing.tracingComplete") finish();
      if (message.method !== "Tracing.dataCollected") return;
      for (const entry of message.params.value) {
        if (
          !["Paint", "Layout", "UpdateLayoutTree", "RasterTask"].includes(entry.name) ||
          entry.ph !== "X" ||
          typeof entry.dur !== "number"
        )
          continue;
        const total = totals[entry.name] ?? { count: 0, totalMs: 0, maxMs: 0 };
        total.count++;
        total.totalMs += entry.dur / 1000;
        total.maxMs = Math.max(total.maxMs, entry.dur / 1000);
        totals[entry.name] = total;
      }
    });
    const started = once(socket, "message");
    socket.send(
      JSON.stringify({
        id: 1,
        method: "Tracing.start",
        params: { categories: "devtools.timeline", transferMode: "ReportEvents" },
      }),
    );
    const [startEvent] = await started;
    if (JSON.parse(String(startEvent.data)).error) throw new Error("Tracing could not start");
    console.log("Tracing ready. Press Enter after the UI actions to print aggregate timings only.");
    await once(process.stdin, "data");
    process.stdin.pause();
    socket.send(JSON.stringify({ id: 2, method: "Tracing.end" }));
    await complete;
    console.log(JSON.stringify(totals));
  } else {
    const reply = once(socket, "message");
    socket.send(
      JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression: await expressions[mode](), returnByValue: true, awaitPromise: true, timeout: 25000 },
      }),
    );
    const [event] = await reply;
    const result = JSON.parse(String(event.data));
    if (result.error || result.result?.exceptionDetails)
      throw new Error("Probe failed; private application data was not printed");
    console.log(JSON.stringify(result.result.result.value));
  }
} finally {
  socket.close();
}
