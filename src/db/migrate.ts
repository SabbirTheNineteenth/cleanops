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

CREATE TABLE IF NOT EXISTS incident_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT 'Unknown',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS incident_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT 'System',
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS incident_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  done_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  done_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_seen_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  success INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS email_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'verify_email',
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_incidents_site ON incidents(site_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents(assigned_to);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_assignments_site ON assignments(site_id);
CREATE INDEX IF NOT EXISTS idx_assignments_worker ON assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_comments_incident ON incident_comments(incident_id);
CREATE INDEX IF NOT EXISTS idx_events_incident ON incident_events(incident_id);
CREATE INDEX IF NOT EXISTS idx_tasks_incident ON incident_tasks(incident_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_email ON auth_attempts(email, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_ip ON auth_attempts(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON email_tokens(token_hash);
`);

  const userCols = await db.execute(`PRAGMA table_info(users)`);
  const hasUserCol = (name: string) => userCols.rows.some((col) => col.name === name);
  if (!hasUserCol("status")) {
    await db.execute(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
    console.log("Added users.status column");
  }
  if (!hasUserCol("email_verified_at")) {
    await db.execute(`ALTER TABLE users ADD COLUMN email_verified_at TEXT`);
    console.log("Added users.email_verified_at column");
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
  if (!hasCol("due_at")) {
    await db.execute(`ALTER TABLE incidents ADD COLUMN due_at TEXT`);
    console.log("Added incidents.due_at column");
  }

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_incidents_due ON incidents(due_at)`);

  console.log(`Migrated schema into ${url}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
