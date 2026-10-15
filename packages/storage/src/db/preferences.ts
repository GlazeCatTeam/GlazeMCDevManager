import type { DatabaseSync } from "node:sqlite";

/** Decode a stored document; malformed JSON falls back without overwriting the original */
function decode(row: { value_json: string } | undefined): unknown {
  if (!row) return undefined;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return undefined;
  }
}

/** Main-process storage for preferences and user layout overrides */
export class PreferenceStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Read an application preference without interpreting its schema */
  get(key: string): unknown {
    return decode(
      this.db.prepare("SELECT value_json FROM settings WHERE scope = 'app' AND key = ?").get(key) as
        | { value_json: string }
        | undefined,
    );
  }

  /** Persist one preference atomically, leaving other settings untouched */
  set(key: string, value: unknown): void {
    this.db
      .prepare(
        "INSERT INTO settings (scope, key, value_json) VALUES ('app', ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value_json = excluded.value_json",
      )
      .run(key, JSON.stringify(value));
  }

  /** Read the current layout schema, falling back for unknown future versions */
  getLayout(page: string): unknown {
    return decode(
      this.db.prepare("SELECT layout_json AS value_json FROM layouts WHERE page = ? AND version = 1").get(page) as
        | { value_json: string }
        | undefined,
    );
  }

  /** Save one layout override without touching appearance preferences */
  setLayout(page: string, value: unknown): void {
    this.db
      .prepare(
        "INSERT INTO layouts (page, version, layout_json, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(page) DO UPDATE SET version = 1, layout_json = excluded.layout_json, updated_at = excluded.updated_at",
      )
      .run(page, JSON.stringify(value), Date.now());
  }

  /** Remove user overrides so each page uses its built-in layout */
  resetLayouts(): void {
    this.db.exec("DELETE FROM layouts");
  }
}
