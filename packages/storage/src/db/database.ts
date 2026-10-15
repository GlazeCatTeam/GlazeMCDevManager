import { DatabaseSync } from "node:sqlite";
import { migrations } from "../migrations";

/** Open (or create) the app database and bring its schema up to date */
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT MAX(version) AS version FROM schema_version").get() as { version: number | null };
  const current = row.version ?? 0;
  for (const [index, sql] of migrations.entries()) {
    const version = index + 1;
    if (version <= current) {
      continue;
    }
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return db;
}
