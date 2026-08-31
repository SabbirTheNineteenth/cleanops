import "dotenv/config";
import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL || "file:cleanops.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const db = createClient({ url, authToken });

async function main() {
  await db.executeMultiple(`
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
  ai_recommended_role TEXT,
  ai_response_window TEXT,
  ai_source TEXT,
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

  const userCols = await db.execute(`PRAGMA table_info(users)`);
  if (!userCols.rows.some((col) => col.name === "status")) {
    await db.execute(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
    console.log("Added users.status column");
  }

  const workerCols = await db.execute(`PRAGMA table_info(workers)`);
  if (!workerCols.rows.some((col) => col.name === "user_id")) {
    await db.execute(`ALTER TABLE workers ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
    console.log("Added workers.user_id column");
  }

  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_user ON workers(user_id) WHERE user_id IS NOT NULL`,
  );

  const incidentCols = await db.execute(`PRAGMA table_info(incidents)`);
  const hasCol = (name: string) => incidentCols.rows.some((col) => col.name === name);
  if (!hasCol("ai_recommended_role")) {
    await db.execute(`ALTER TABLE incidents ADD COLUMN ai_recommended_role TEXT`);
    console.log("Added incidents.ai_recommended_role column");
  }
  if (!hasCol("ai_response_window")) {
    await db.execute(`ALTER TABLE incidents ADD COLUMN ai_response_window TEXT`);
    console.log("Added incidents.ai_response_window column");
  }
  if (!hasCol("ai_source")) {
    await db.execute(`ALTER TABLE incidents ADD COLUMN ai_source TEXT`);
    console.log("Added incidents.ai_source column");
  }

  console.log(`Migrated schema into ${url}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
