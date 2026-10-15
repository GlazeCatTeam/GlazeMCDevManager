// Field readers for raw platform payloads. Missing required fields mean the response changed,
// so callers turn a null into a parse error instead of filling in defaults

/** A finite number, also accepting numeric strings such as "12.5"; otherwise null */
export function readNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** A non-empty string, also accepting numbers; otherwise null */
export function readString(value: unknown): string | null {
  if (typeof value === "string") {
    return value.length > 0 ? value : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/** The object at a key of a payload, or an empty object when it is missing */
export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The array in a payload, or null when it is not an array */
export function readArray(value: unknown): Record<string, unknown>[] | null {
  return Array.isArray(value) ? value.map(readRecord) : null;
}
