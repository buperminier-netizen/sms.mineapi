import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function createDb(databasePath) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_key TEXT NOT NULL UNIQUE,
      phone_number TEXT NOT NULL,
      sms_api_url TEXT NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 25,
      downstream_name TEXT,
      created_at TEXT NOT NULL,
      redeemed_at TEXT,
      expires_at TEXT,
      archived_at TEXT,
      status TEXT NOT NULL DEFAULT 'new'
    );

    CREATE TABLE IF NOT EXISTS codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      message TEXT NOT NULL,
      received_at TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(card_id, source_hash),
      FOREIGN KEY(card_id) REFERENCES cards(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  migrateCards(db);
  return db;
}

function migrateCards(db) {
  const columns = db.prepare("PRAGMA table_info(cards)").all().map((column) => column.name);
  if (!columns.includes("duration_hours")) {
    db.exec("ALTER TABLE cards ADD COLUMN duration_hours INTEGER");
  }
  if (!columns.includes("query_count")) {
    db.exec("ALTER TABLE cards ADD COLUMN query_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.includes("last_queried_at")) {
    db.exec("ALTER TABLE cards ADD COLUMN last_queried_at TEXT");
  }
  if (!columns.includes("downstream_name")) {
    db.exec("ALTER TABLE cards ADD COLUMN downstream_name TEXT");
  }
  db.prepare(`
    UPDATE cards
    SET duration_hours = COALESCE(duration_hours, duration_days * 24, 600)
    WHERE duration_hours IS NULL
  `).run();
}
