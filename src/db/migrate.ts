import "dotenv/config";
import Database from "better-sqlite3";

const dbFile = process.env.DATABASE_URL || "cleanops.db";
const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Field Technician',
  status TEXT NOT NULL DEFAULT 'available',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  unassigned_at TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  reported_by INTEGER NOT NULL REFERENCES users(id),
  assigned_to INTEGER REFERENCES workers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT NOT NULL DEFAULT 'medium',
  ai_summary TEXT,
  ai_severity TEXT,
  ai_suggested_action TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_site ON incidents(site_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_assignments_site ON assignments(site_id);
CREATE INDEX IF NOT EXISTS idx_assignments_worker ON assignments(worker_id);
`);

const userCols = db.prepare(`PRAGMA table_info(users)`).all() as {
  name: string;
}[];
if (!userCols.some((col) => col.name === "status")) {
  db.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
  console.log("↳ Added users.status column");
}

const workerCols = db.prepare(`PRAGMA table_info(workers)`).all() as {
  name: string;
}[];
if (!workerCols.some((col) => col.name === "user_id")) {
  db.exec(`ALTER TABLE workers ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
  console.log("↳ Added workers.user_id column");
}

db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_user ON workers(user_id) WHERE user_id IS NOT NULL`,
);

console.log(`✅ Migrated schema into ${dbFile}`);
db.close();
