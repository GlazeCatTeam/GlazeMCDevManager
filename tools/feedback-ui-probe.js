(() => {
  // Temporary passive observers: no requests, credentials, feedback text or image URLs are collected
  globalThis.__glazeFeedbackProbe?.dispose();
  const samples = [];
  const longTasks = [];
  const frames = [];
  const seen = new WeakSet();
  let active = null;
  let raf;
  let previousFrame;
  const round = (number) => Math.round(number * 10) / 10;
  const frame = (time) => {
    if (previousFrame !== undefined)
      frames.push({ time, gap: time - previousFrame, visible: document.visibilityState === "visible" });
    previousFrame = time;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const begin = (action) => {
    active = { action, start: performance.now(), images: [], sawBusy: false };
    samples.push(active);
    return active;
  };
  const finishPaint = (sample) => {
    if (sample.domReady !== undefined) return;
    sample.domReady = performance.now();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        sample.afterPaint = performance.now();
      }),
    );
  };
  const inspect = () => {
    if (!active) return;
    const sample = active;
    const list = document.querySelector('section[aria-label="反馈列表"]');
    if (list?.getAttribute("aria-busy") === "true") sample.sawBusy = true;
    if (
      list?.getAttribute("aria-busy") === "false" &&
      (sample.sawBusy || ["select-feedback", "image-preview"].includes(sample.action))
    )
      finishPaint(sample);
    for (const img of document.querySelectorAll('img[src^="glaze-image:"]')) {
      if (seen.has(img) || (!img.closest('section[aria-label="反馈详情"]') && !img.closest('[role="dialog"]')))
        continue;
      seen.add(img);
      const item = { inserted: performance.now() };
      sample.images.push(item);
      const loaded = async () => {
        item.loaded = performance.now();
        item.ok = img.naturalWidth > 0;
        item.width = img.naturalWidth;
        item.height = img.naturalHeight;
        try {
          await img.decode();
          item.decoded = performance.now();
        } catch {
          item.ok = false;
        }
      };
      if (img.complete) void loaded();
      else {
        img.addEventListener("load", loaded, { once: true });
        img.addEventListener(
          "error",
          () => {
            item.loaded = performance.now();
            item.ok = false;
          },
          { once: true },
        );
      }
    }
  };
  const mutation = new MutationObserver(inspect);
  mutation.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-busy", "src"],
  });
  const performanceObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === "longtask") longTasks.push({ start: entry.startTime, duration: entry.duration });
      if (entry.entryType === "mark" && entry.name === "glaze.feedback.response" && active)
        active.response = entry.startTime;
    }
  });
  performanceObserver.observe({ entryTypes: ["longtask", "mark"] });
  const onClick = (event) => {
    const button = event.target.closest?.("button");
    if (!button) return;
    const label = button.textContent?.trim();
    if (label === "玩家反馈") begin("page-open");
    else if (document.querySelector("main h1")?.textContent === "玩家反馈" && label === "刷新") begin("refresh");
    else if (button.closest('section[aria-label="反馈列表"]') && button.hasAttribute("aria-pressed"))
      begin("select-feedback");
    else if (button.getAttribute("aria-label")?.startsWith("查看附件图片")) begin("image-preview");
  };
  document.addEventListener("click", onClick, true);
  globalThis.__glazeFeedbackProbe = {
    begin,
    read() {
      const now = performance.now();
      return samples.map((sample, index) => {
        const end = Math.min(
          samples[index + 1]?.start ?? now,
          Math.max(
            sample.afterPaint ?? sample.start,
            ...sample.images.map((image) => image.decoded ?? image.loaded ?? sample.start),
          ) + 500,
        );
        const selectedFrames = frames.filter(
          (frame) => frame.time >= sample.start && frame.time <= end && frame.visible,
        );
        const tasks = longTasks.filter((task) => task.start >= sample.start && task.start < end);
        return {
          action: sample.action,
          responseMs: sample.response === undefined ? null : round(sample.response - sample.start),
          domReadyMs: sample.domReady === undefined ? null : round(sample.domReady - sample.start),
          afterPaintMs: sample.afterPaint === undefined ? null : round(sample.afterPaint - sample.start),
          responseToPaintMs:
            sample.response === undefined || sample.afterPaint === undefined
              ? null
              : round(sample.afterPaint - sample.response),
          observedMs: round(end - sample.start),
          frameCount: selectedFrames.length,
          maxFrameGapMs: round(Math.max(0, ...selectedFrames.map((frame) => frame.gap))),
          framesOver33ms: selectedFrames.filter((frame) => frame.gap > 33.4).length,
          framesOver50ms: selectedFrames.filter((frame) => frame.gap > 50).length,
          longTasks: tasks.map((task) => round(task.duration)),
          images: sample.images.map((image) => ({
            loadMs: image.loaded === undefined ? null : round(image.loaded - image.inserted),
            decodeAfterLoadMs:
              image.decoded === undefined || image.loaded === undefined ? null : round(image.decoded - image.loaded),
            width: image.width,
            height: image.height,
            ok: image.ok,
          })),
        };
      });
    },
    dispose() {
      cancelAnimationFrame(raf);
      mutation.disconnect();
      performanceObserver.disconnect();
      document.removeEventListener("click", onClick, true);
      delete globalThis.__glazeFeedbackProbe;
      performance.clearMarks("glaze.feedback.response");
    },
  };
  return { installed: true, visible: document.visibilityState === "visible" };
})();
