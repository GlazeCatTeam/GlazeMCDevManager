import type { DatabaseSync } from "node:sqlite";

/** OS-backed encryption (Electron safeStorage / DPAPI), injected by the main process */
export interface Cipher {
  encrypt(plain: string): Uint8Array;
  decrypt(blob: Uint8Array): string;
}

/** Encrypted session store; the only code that reads or writes the credentials table */
export class Vault {
  constructor(
    private readonly db: DatabaseSync,
    private readonly cipher: Cipher,
  ) {}

  /** Encrypt and save an account's session cookie, replacing any previous one */
  saveSession(accountId: string, sessionCookie: string): void {
    this.db
      .prepare(
        `INSERT INTO credentials (account_id, session_blob, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET session_blob = excluded.session_blob, updated_at = excluded.updated_at`,
      )
      .run(accountId, this.cipher.encrypt(sessionCookie), Date.now());
  }

  /** Decrypted session cookie of an account, or null when none is saved or it cannot be decrypted */
  loadSession(accountId: string): string | null {
    const row = this.db.prepare("SELECT session_blob FROM credentials WHERE account_id = ?").get(accountId) as
      | { session_blob: Uint8Array }
      | undefined;
    if (!row) {
      return null;
    }
    try {
      return this.cipher.decrypt(row.session_blob);
    } catch {
      // Encrypted by another Windows user or a reinstalled OS profile; treat as no session
      return null;
    }
  }

  /** Forget an account's session */
  deleteSession(accountId: string): void {
    this.db.prepare("DELETE FROM credentials WHERE account_id = ?").run(accountId);
  }
}
