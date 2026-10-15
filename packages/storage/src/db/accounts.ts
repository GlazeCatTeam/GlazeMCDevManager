import type { DatabaseSync } from "node:sqlite";

export type StoredLoginMethod = "window" | "cookie";
export type StoredSessionStatus = "active" | "expired" | "offline";

/** Account metadata row; holds no credentials */
export interface AccountRecord {
  id: string;
  nickname: string;
  passport: string | null;
  avatarUrl: string | null;
  loginMethod: StoredLoginMethod;
  lastLoginAt: number;
  status: StoredSessionStatus;
  current: boolean;
}

interface AccountRow {
  id: string;
  nickname: string;
  passport: string | null;
  avatar_url: string | null;
  login_method: string;
  last_login_at: number;
  status: string;
  is_current: number;
}

/** Map a database row to a record */
function toRecord(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    nickname: row.nickname,
    passport: row.passport,
    avatarUrl: row.avatar_url,
    loginMethod: row.login_method === "cookie" ? "cookie" : "window",
    lastLoginAt: row.last_login_at,
    status: row.status === "active" || row.status === "offline" ? row.status : "expired",
    current: row.is_current === 1,
  };
}

/** Saved accounts; at most one is current */
export class AccountStore {
  constructor(private readonly db: DatabaseSync) {}

  /** All accounts, most recently used first */
  list(): AccountRecord[] {
    const rows = this.db.prepare("SELECT * FROM accounts ORDER BY last_login_at DESC").all() as unknown as AccountRow[];
    return rows.map(toRecord);
  }

  /** One account by id */
  get(id: string): AccountRecord | null {
    const row = this.db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
    return row ? toRecord(row) : null;
  }

  /** Insert or update an account; `current` is handled by setCurrent */
  save(record: AccountRecord): void {
    this.db
      .prepare(
        `INSERT INTO accounts (id, nickname, passport, avatar_url, login_method, last_login_at, status, is_current)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname, passport = excluded.passport,
           avatar_url = excluded.avatar_url, login_method = excluded.login_method,
           last_login_at = excluded.last_login_at, status = excluded.status`,
      )
      .run(
        record.id,
        record.nickname,
        record.passport,
        record.avatarUrl,
        record.loginMethod,
        record.lastLoginAt,
        record.status,
      );
  }

  /** Update only the session status of an account */
  setStatus(id: string, status: StoredSessionStatus): void {
    this.db.prepare("UPDATE accounts SET status = ? WHERE id = ?").run(status, id);
  }

  /** Make one account current, or none */
  setCurrent(id: string | null): void {
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE accounts SET is_current = 0").run();
      if (id !== null) {
        this.db.prepare("UPDATE accounts SET is_current = 1 WHERE id = ?").run(id);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Delete an account; its credentials go with it (foreign key cascade) */
  remove(id: string): void {
    this.db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  }
}
