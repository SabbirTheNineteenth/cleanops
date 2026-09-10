import type { MigrationDatabase } from "../migration-ledger";
import { migrationChecksum } from "../migration-checksum";

type SqlBatchOperation = Readonly<{ name: string; type: "sql-batch"; sql: string }>;
type EnsureColumnsOperation = Readonly<{
  name: string;
  type: "ensure-columns";
  predicateSql: string;
  columns: readonly Readonly<{ name: string; sql: string }>[];
}>;
export type LedgerBootstrapOperation = SqlBatchOperation | EnsureColumnsOperation;

function freezeOperations(operations: readonly LedgerBootstrapOperation[]): readonly LedgerBootstrapOperation[] {
  return Object.freeze(operations.map((operation) => Object.freeze(
    operation.type === "ensure-columns"
      ? { ...operation, columns: Object.freeze(operation.columns.map((column) => Object.freeze(column))) }
      : operation,
  )));
}

/**
 * Foundational metadata bootstrap, not an application migration: it creates and
 * evolves the ledger required before versioned application migrations can be recorded.
 * Its checked-in payload and checksum are therefore canonical and immutable.
 */
export const ledgerBootstrapPayload = Object.freeze({
  operations: freezeOperations([
    {
      name: "create-ledger-and-lock-tables",
      type: "sql-batch",
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          checksum TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
        );
        CREATE TABLE IF NOT EXISTS schema_migration_locks (
          name TEXT PRIMARY KEY,
          owner TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
      `,
    },
    {
      name: "ensure-legacy-ledger-checksum",
      type: "ensure-columns",
      predicateSql: "PRAGMA table_info(schema_migrations)",
      columns: [
        { name: "checksum", sql: "ALTER TABLE schema_migrations ADD COLUMN checksum TEXT" },
      ],
    },
  ]),
});

/** Executes precisely the canonical foundational bootstrap instructions. */
export async function applyLedgerBootstrap(database: MigrationDatabase): Promise<void> {
  for (const operation of ledgerBootstrapPayload.operations) {
    if (operation.type === "ensure-columns") {
      const columns = await database.execute(operation.predicateSql);
      for (const column of operation.columns) {
        if (!columns.rows.some((existing) => existing.name === column.name)) {
          await database.execute(column.sql);
        }
      }
      continue;
    }
    await database.executeMultiple(operation.sql);
  }
}

export const ledgerBootstrapChecksum = migrationChecksum(JSON.stringify(ledgerBootstrapPayload));
