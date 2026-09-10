import { randomUUID } from "node:crypto";
import type { Client, InStatement } from "@libsql/client";
import { applyLedgerBootstrap } from "./migrations/000_migration_ledger_bootstrap";

export { migrationChecksum } from "./migration-checksum";

export interface MigrationDatabase {
  execute(statement: InStatement): ReturnType<Client["execute"]>;
  executeMultiple(sql: string): ReturnType<Client["executeMultiple"]>;
}

export interface VersionedMigration {
  version: string;
  checksum: string;
  /** Migration operations must be idempotent because a process can fail after schema work and before ledger recording. */
  apply(database: MigrationDatabase): Promise<unknown>;
}

const LOCK_NAME = "schema-migrations";
const LOCK_LEASE_MS = 5 * 60_000;
const LOCK_WAIT_MS = 50;
const LOCK_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureLedger(database: MigrationDatabase): Promise<void> {
  await applyLedgerBootstrap(database);
}

async function acquireLock(database: MigrationDatabase, owner: string): Promise<void> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_LEASE_MS).toISOString();
    const result = await database.execute({
      sql: `
        INSERT INTO schema_migration_locks (name, owner, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
        WHERE julianday(schema_migration_locks.expires_at) <= julianday(?)
        RETURNING owner
      `,
      args: [LOCK_NAME, owner, expiresAt, now.toISOString()],
    });
    if (result.rows[0]?.owner === owner) return;
    await sleep(LOCK_WAIT_MS);
  }
  throw new Error("Timed out waiting for the schema migration lock");
}

async function releaseLock(database: MigrationDatabase, owner: string): Promise<void> {
  await database.execute({
    sql: "DELETE FROM schema_migration_locks WHERE name = ? AND owner = ?",
    args: [LOCK_NAME, owner],
  });
}

export async function applyVersionedMigrations(
  database: MigrationDatabase,
  migrations: readonly VersionedMigration[],
): Promise<void> {
  await ensureLedger(database);
  const owner = randomUUID();
  await acquireLock(database, owner);
  try {
    for (const migration of migrations) {
      const existing = await database.execute({
        sql: "SELECT checksum FROM schema_migrations WHERE version = ?",
        args: [migration.version],
      });
      if (existing.rows.length) {
        if (existing.rows[0]?.checksum !== migration.checksum) {
          throw new Error(`Migration checksum mismatch for migration ${migration.version}`);
        }
        continue;
      }

      await migration.apply(database);
      await database.execute({
        sql: "INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)",
        args: [migration.version, migration.checksum],
      });
    }
  } finally {
    await releaseLock(database, owner);
  }
}
