import { remoteImageUrl } from "@glaze/plugin-sdk";

const allowed = new Set([
  "P",
  "DIV",
  "BR",
  "SPAN",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "STRIKE",
  "H1",
  "H2",
  "H3",
  "H4",
  "UL",
  "OL",
  "LI",
  "BLOCKQUOTE",
  "A",
  "IMG",
  "FONT",
]);
const removed = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "SVG",
  "MATH",
  "FORM",
  "INPUT",
  "BUTTON",
  "VIDEO",
  "AUDIO",
]);
const styleKeys = [
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
];

/** Allow external links only as inert editor content */
function safeLink(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
/** Uploaded and existing images are rendered through the existing restricted image proxy */
function safeImage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      [".netease.com", ".163.com", ".126.net", ".127.net"].some((suffix) => url.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

/** Sanitize platform HTML; never insert remote scripts, handlers or untrusted styles */
export function sanitizeWorkHtml(html: string, display = false): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    if (removed.has(el.tagName)) {
      el.remove();
      continue;
    }
    if (!allowed.has(el.tagName)) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    const style = el instanceof HTMLElement ? el.style : null;
    const styles = styleKeys.map((key) => [key, style?.getPropertyValue(key) ?? ""]);
    const href = el.getAttribute("href") ?? "";
    const src = el.getAttribute("data-work-source") ?? el.getAttribute("src") ?? "";
    const size = el.getAttribute("size");
    const color = el.getAttribute("color");
    for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
    if (el instanceof HTMLElement)
      for (const [key, value] of styles)
        if (key && value && !/url\s*\(|expression|var\s*\(/i.test(value)) el.style.setProperty(key, value);
    if (el.tagName === "FONT") {
      if (size && /^[1-7]$/.test(size)) el.setAttribute("size", size);
      if (color && /^#[0-9a-f]{3,8}$/i.test(color)) el.setAttribute("color", color);
    }
    if (el.tagName === "A" && safeLink(href)) el.setAttribute("href", href);
    if (el.tagName === "IMG") {
      if (!safeImage(src)) {
        el.remove();
        continue;
      }
      el.setAttribute("src", display ? (remoteImageUrl(src) ?? "") : src);
      if (display) el.setAttribute("data-work-source", src);
      el.setAttribute("alt", "作品图片");
    }
  }
  return doc.body.innerHTML;
}

/** Count player-visible characters rather than HTML syntax */
export function workHtmlLength(html: string): number {
  return new DOMParser().parseFromString(html, "text/html").body.textContent?.length ?? 0;
}
