import type { MigrationDatabase } from "../migration-ledger";
import { migrationChecksum } from "../migration-ledger";

type SqlOperation = Readonly<{ name: string; type: "sql" | "sql-batch"; sql: string }>;
type EnsureColumnsOperation = Readonly<{
  name: string;
  type: "ensure-columns";
  predicateSql: string;
  columns: readonly Readonly<{ name: string; sql: string; logMessage: string }>[];
}>;
export type SchemaRemediationOperation = SqlOperation | EnsureColumnsOperation;

function freezeOperations(operations: readonly SchemaRemediationOperation[]): readonly SchemaRemediationOperation[] {
  return Object.freeze(operations.map((operation) => Object.freeze(
    operation.type === "ensure-columns"
      ? { ...operation, columns: Object.freeze(operation.columns.map((column) => Object.freeze(column))) }
      : operation,
  )));
}

/** Checked-in, immutable canonical execution instructions for this released migration. */
export const schemaRemediationPayload = Object.freeze({
  operations: freezeOperations([
    { name: "create-base-tables-and-indexes", type: "sql-batch", sql: "\nCREATE TABLE IF NOT EXISTS triage_outbox (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,\n  status TEXT NOT NULL DEFAULT 'pending',\n  attempts INTEGER NOT NULL DEFAULT 0,\n  available_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),\n  claimed_at TEXT,\n  completed_at TEXT,\n  last_error TEXT,\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),\n  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE TABLE IF NOT EXISTS rate_limit_buckets (\n  key TEXT PRIMARY KEY,\n  count INTEGER NOT NULL DEFAULT 0,\n  window_ends_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE TABLE IF NOT EXISTS users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL UNIQUE,\n  password_hash TEXT NOT NULL,\n  role TEXT NOT NULL DEFAULT 'user',\n  status TEXT NOT NULL DEFAULT 'active',\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE TABLE IF NOT EXISTS sites (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  code TEXT NOT NULL UNIQUE,\n  location TEXT NOT NULL DEFAULT '',\n  status TEXT NOT NULL DEFAULT 'active',\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE TABLE IF NOT EXISTS workers (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL UNIQUE,\n  phone TEXT NOT NULL DEFAULT '',\n  role TEXT NOT NULL DEFAULT 'Field Technician',\n  status TEXT NOT NULL DEFAULT 'available',\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE TABLE IF NOT EXISTS assignments (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,\n  worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,\n  active INTEGER NOT NULL DEFAULT 1,\n  assigned_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),\n  unassigned_at TEXT\n);\n\nCREATE TABLE IF NOT EXISTS incidents (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  title TEXT NOT NULL,\n  description TEXT NOT NULL DEFAULT '',\n  category TEXT NOT NULL DEFAULT 'general',\n  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,\n  reported_by INTEGER NOT NULL REFERENCES users(id),\n  assigned_to INTEGER REFERENCES workers(id) ON DELETE SET NULL,\n  status TEXT NOT NULL DEFAULT 'open',\n  severity TEXT NOT NULL DEFAULT 'medium',\n  ai_summary TEXT,\n  ai_severity TEXT,\n  ai_suggested_action TEXT,\n  ai_recommended_role TEXT,\n  ai_response_window TEXT,\n  ai_source TEXT,\n  ai_status TEXT NOT NULL DEFAULT 'pending',\n  resolution_note TEXT,\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),\n  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),\n  version INTEGER NOT NULL DEFAULT 1,\n  resolved_at TEXT\n);\n\nCREATE TABLE IF NOT EXISTS incident_comments (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,\n  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,\n  author_name TEXT NOT NULL DEFAULT 'Unknown',\n  body TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE TABLE IF NOT EXISTS incident_events (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,\n  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,\n  actor_name TEXT NOT NULL DEFAULT 'System',\n  type TEXT NOT NULL,\n  message TEXT NOT NULL,\n  from_value TEXT,\n  to_value TEXT,\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE TABLE IF NOT EXISTS incident_tasks (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,\n  title TEXT NOT NULL,\n  done INTEGER NOT NULL DEFAULT 0,\n  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,\n  done_by INTEGER REFERENCES users(id) ON DELETE SET NULL,\n  done_at TEXT,\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE TABLE IF NOT EXISTS notifications (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  type TEXT NOT NULL DEFAULT 'info',\n  title TEXT NOT NULL,\n  body TEXT NOT NULL DEFAULT '',\n  link TEXT,\n  read_at TEXT,\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE TABLE IF NOT EXISTS audit_logs (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,\n  actor_email TEXT NOT NULL DEFAULT 'system',\n  action TEXT NOT NULL,\n  entity TEXT NOT NULL,\n  entity_id INTEGER,\n  detail TEXT NOT NULL DEFAULT '',\n  ip TEXT NOT NULL DEFAULT '',\n  user_agent TEXT NOT NULL DEFAULT '',\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE TABLE IF NOT EXISTS sessions (\n  id TEXT PRIMARY KEY,\n  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  user_agent TEXT NOT NULL DEFAULT '',\n  ip TEXT NOT NULL DEFAULT '',\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),\n  last_seen_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),\n  expires_at TEXT NOT NULL,\n  revoked_at TEXT\n);\n\nCREATE TABLE IF NOT EXISTS auth_attempts (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  kind TEXT NOT NULL,\n  email TEXT NOT NULL DEFAULT '',\n  ip TEXT NOT NULL DEFAULT '',\n  success INTEGER NOT NULL DEFAULT 0,\n  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)\n);\n\nCREATE INDEX IF NOT EXISTS idx_incidents_site ON incidents(site_id);\nCREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);\nCREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);\nCREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents(assigned_to);\nCREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at);\nCREATE INDEX IF NOT EXISTS idx_assignments_site ON assignments(site_id);\nCREATE INDEX IF NOT EXISTS idx_assignments_worker ON assignments(worker_id);\n\nCREATE INDEX IF NOT EXISTS idx_comments_incident ON incident_comments(incident_id);\nCREATE INDEX IF NOT EXISTS idx_events_incident ON incident_events(incident_id);\nCREATE INDEX IF NOT EXISTS idx_tasks_incident ON incident_tasks(incident_id);\nCREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);\nCREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);\nCREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);\nCREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);\nCREATE INDEX IF NOT EXISTS idx_attempts_email ON auth_attempts(email, created_at);\nCREATE INDEX IF NOT EXISTS idx_attempts_ip ON auth_attempts(ip, created_at);\n" },
    { name: "ensure-users-status", type: "ensure-columns", predicateSql: "PRAGMA table_info(users)", columns: [
      { name: "status", sql: "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'", logMessage: "Added users.status column" },
    ] },
    { name: "ensure-workers-user-id", type: "ensure-columns", predicateSql: "PRAGMA table_info(workers)", columns: [
      { name: "user_id", sql: "ALTER TABLE workers ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE", logMessage: "Added workers.user_id column" },
    ] },
    { name: "create-workers-user-index", type: "sql", sql: "CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_user ON workers(user_id) WHERE user_id IS NOT NULL" },
    { name: "deactivate-duplicate-assignments", type: "sql", sql: "UPDATE assignments SET active = 0, unassigned_at = COALESCE(unassigned_at, CURRENT_TIMESTAMP) WHERE active = 1 AND id NOT IN (SELECT MAX(id) FROM assignments WHERE active = 1 GROUP BY site_id, worker_id)" },
    { name: "create-active-assignment-index", type: "sql", sql: "CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_active_site_worker ON assignments(site_id, worker_id) WHERE active = 1" },
    { name: "ensure-incident-triage-columns", type: "ensure-columns", predicateSql: "PRAGMA table_info(incidents)", columns: [
      { name: "ai_recommended_role", sql: "ALTER TABLE incidents ADD COLUMN ai_recommended_role TEXT", logMessage: "Added incidents.ai_recommended_role column" },
      { name: "ai_response_window", sql: "ALTER TABLE incidents ADD COLUMN ai_response_window TEXT", logMessage: "Added incidents.ai_response_window column" },
      { name: "ai_source", sql: "ALTER TABLE incidents ADD COLUMN ai_source TEXT", logMessage: "Added incidents.ai_source column" },
      { name: "ai_status", sql: "ALTER TABLE incidents ADD COLUMN ai_status TEXT NOT NULL DEFAULT 'pending'", logMessage: "Added incidents.ai_status column" },
      { name: "due_at", sql: "ALTER TABLE incidents ADD COLUMN due_at TEXT", logMessage: "Added incidents.due_at column" },
      { name: "version", sql: "ALTER TABLE incidents ADD COLUMN version INTEGER NOT NULL DEFAULT 1", logMessage: "Added incidents.version column" },
    ] },
    { name: "create-incidents-due-index", type: "sql", sql: "CREATE INDEX IF NOT EXISTS idx_incidents_due ON incidents(due_at)" },
    { name: "create-triage-outbox-ready-index", type: "sql", sql: "CREATE INDEX IF NOT EXISTS idx_triage_outbox_ready ON triage_outbox(status, available_at)" },
    { name: "create-sessions-retention-index", type: "sql", sql: "CREATE INDEX IF NOT EXISTS idx_sessions_retention ON sessions(expires_at, revoked_at)" },
  ]),
});

/** Executes precisely the checked-in instructions represented by schemaRemediationPayload. */
export async function applySchemaRemediations(database: MigrationDatabase): Promise<void> {
  for (const operation of schemaRemediationPayload.operations) {
    if (operation.type === "ensure-columns") {
      const columns = await database.execute(operation.predicateSql);
      for (const column of operation.columns) {
        if (!columns.rows.some((existing) => existing.name === column.name)) {
          await database.execute(column.sql);
          console.log(column.logMessage);
        }
      }
      continue;
    }
    if (operation.type === "sql-batch") {
      await database.executeMultiple(operation.sql);
      continue;
    }
    await database.execute(operation.sql);
  }
}

export const schemaRemediationChecksum = migrationChecksum(JSON.stringify(schemaRemediationPayload));
