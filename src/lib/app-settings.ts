import Database from "better-sqlite3";
import { resolveSqliteFilePath } from "@/lib/sqlite-path";

type Row = { key: string; value: string };

function getDbFilePath() {
  return resolveSqliteFilePath();
}

function getConn() {
  const dbPath = getDbFilePath();
  const conn = new Database(dbPath);
  conn.pragma("journal_mode = WAL");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return conn;
}

export async function getAppSetting<T>(key: string): Promise<T | null> {
  const conn = getConn();
  try {
    const row = conn
      .prepare("SELECT key, value FROM app_settings WHERE key = ? LIMIT 1")
      .get(key) as Row | undefined;
    if (!row) return null;
    return JSON.parse(row.value) as T;
  } finally {
    conn.close();
  }
}

export async function setAppSetting<T>(key: string, value: T): Promise<void> {
  const conn = getConn();
  try {
    conn
      .prepare(
        "INSERT INTO app_settings(key, value, updatedAt) VALUES(?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt",
      )
      .run(key, JSON.stringify(value));
  } finally {
    conn.close();
  }
}

