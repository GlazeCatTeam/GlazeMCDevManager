// Schema migrations in order; never edit a shipped entry, append a new one instead

export const migrations: string[] = [
  // 1: accounts and their encrypted sessions
  `CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    passport TEXT,
    avatar_url TEXT,
    login_method TEXT NOT NULL,
    last_login_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE credentials (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    session_blob BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  // 2: application preferences and user layout overrides
  `CREATE TABLE settings (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    PRIMARY KEY (scope, key)
  );
  CREATE TABLE layouts (
    page TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    layout_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
];
