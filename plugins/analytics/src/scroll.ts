/** Reveal content only inside its nearest scroll viewport, keeping the desktop shell stationary */
export function scrollWithinView(target: Element | null | undefined, block: "start" | "nearest", behavior: ScrollBehavior = "auto"): void {
  if (!target) return;
  let viewport = target.parentElement;
  while (viewport && viewport !== document.body && viewport !== document.documentElement) {
    if (/^(auto|scroll)$/.test(getComputedStyle(viewport).overflowY)) {
      const bounds = viewport.getBoundingClientRect();
      const item = target.getBoundingClientRect();
      // Rectangles include CSS zoom, while scrollTop and client dimensions use layout pixels
      const scale = viewport.offsetHeight ? bounds.height / viewport.offsetHeight : 1;
      const top = (item.top - bounds.top) / scale - viewport.clientTop;
      const bottom = (item.bottom - bounds.top) / scale - viewport.clientTop;
      const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      const delta = block === "start" ? top - margin : top < 0 ? top : bottom > viewport.clientHeight ? bottom - viewport.clientHeight : 0;
      if (delta !== 0) viewport.scrollTo({ top: viewport.scrollTop + delta, behavior });
      return;
    }
    viewport = viewport.parentElement;
  }
}
