import { sanitizeWorkHtml } from "@glaze/plugin-sdk";
import { useMemo } from "react";
import styles from "./ActivityContent.module.css";

/** Keep safe paragraph/list markup while letting the active theme control typography and colors */
function activityDocument(value: string): Document {
  const doc = new DOMParser().parseFromString(sanitizeWorkHtml(value, true), "text/html");
  for (const element of doc.body.querySelectorAll("[style], [color], [size]")) {
    element.removeAttribute("style");
    element.removeAttribute("color");
    element.removeAttribute("size");
  }
  // Activity descriptions are read-only content, not navigation inside the app window
  for (const link of doc.body.querySelectorAll("a")) link.replaceWith(...link.childNodes);
  return doc;
}

/** Produce readable card summaries without literal tags or words joined across paragraph boundaries */
export function activityExcerpt(value: string): string {
  const doc = activityDocument(value);
  for (const element of doc.body.querySelectorAll("br")) element.replaceWith(" ");
  for (const element of doc.body.querySelectorAll("p, div, h1, h2, h3, h4, li, blockquote")) element.append(" ");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Render platform instructions as sanitized rich text instead of escaping HTML tags into the page */
export function ActivityContent({ value }: { value: string }) {
  const html = useMemo(() => activityDocument(value).body.innerHTML, [value]);
  return (
    <div
      className={styles.content}
      data-activity-content=""
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shared allowlist strips active content and proxies images; local normalization removes author styles and links
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
