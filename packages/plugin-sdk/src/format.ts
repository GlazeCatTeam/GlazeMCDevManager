// Shared display formats so every plugin shows platform times the same way

/** Zero-pad a date part to two digits */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Platform ISO timestamp as a local date, e.g. "2026-10-13T18:50:10+00:00" -> "2026-10-14" */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Platform ISO timestamp as local date and minute, e.g. "2026-10-14 03:01" */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${formatDate(iso)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Compact local time for dense lists, e.g. "10-14 03:01" */
export function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
