import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyVersionedMigrations, migrationChecksum, type VersionedMigration } from "../src/db/migration-ledger";
import {
  applyLedgerBootstrap,
  ledgerBootstrapChecksum,
  ledgerBootstrapPayload,
} from "../src/db/migrations/000_migration_ledger_bootstrap";
import {
  schemaRemediationChecksum,
  schemaRemediationPayload,
} from "../src/db/migrations/20260910.1_schema_remediations";

const directory = mkdtempSync(join(tmpdir(), "cleanops-migrations-"));
const databasePath = join(directory, "migrations.db").replace(/\\/g, "/");
const client = createClient({ url: `file:${databasePath}` });

const migrations: VersionedMigration[] = [
  {
    version: "001_create_probe",
    checksum: "sha256:test-create-probe",
    apply: (database) => database.execute("CREATE TABLE IF NOT EXISTS migration_probe (id INTEGER PRIMARY KEY)"),
  },
];

test.after(() => client.close());

test("versioned migrations record a checksum and apply each version exactly once", async () => {
  await applyVersionedMigrations(client, migrations);
  await applyVersionedMigrations(client, migrations);

  const ledger = await client.execute("SELECT version, checksum, applied_at FROM schema_migrations");
  assert.deepEqual(ledger.rows.map((row) => row.version), ["001_create_probe"]);
  assert.equal(ledger.rows[0]?.checksum, "sha256:test-create-probe");
  assert.ok(ledger.rows[0]?.applied_at);
});

test("versioned migrations fail closed when an applied checksum differs", async () => {
  await assert.rejects(
    applyVersionedMigrations(client, [{ ...migrations[0]!, checksum: "sha256:changed" }]),
    /checksum mismatch for migration 001_create_probe/i,
  );
});

test("a released migration's derived checksum rejects changed migration content", async () => {
  const content = "CREATE TABLE immutable_probe (id INTEGER PRIMARY KEY)";
  const migration = {
    version: "001b_immutable_probe",
    checksum: migrationChecksum(content),
    apply: (database: typeof client) => database.execute("CREATE TABLE IF NOT EXISTS immutable_probe (id INTEGER PRIMARY KEY)"),
  } satisfies VersionedMigration;
  await applyVersionedMigrations(client, [migration]);
  await assert.rejects(
    applyVersionedMigrations(client, [{ ...migration, checksum: migrationChecksum(`${content} -- changed`) }]),
    /checksum mismatch for migration 001b_immutable_probe/i,
  );
});

test("the schema remediation checksum is canonical across source and compiled operation forms", () => {
  const compiledOperationForm = JSON.parse(JSON.stringify(schemaRemediationPayload));
  assert.equal(schemaRemediationChecksum, migrationChecksum(JSON.stringify(compiledOperationForm)));
});

test("the schema remediation checksum changes when canonical migration content changes", () => {
  const changedPayload = JSON.parse(JSON.stringify(schemaRemediationPayload)) as {
    operations: Array<{ type: string; sql?: string }>;
  };
  changedPayload.operations[0]!.sql = `${changedPayload.operations[0]!.sql}\n-- changed`;
  assert.notEqual(schemaRemediationChecksum, migrationChecksum(JSON.stringify(changedPayload)));
});

test("schema remediation execution is sourced exclusively from the canonical payload", () => {
  const migrationEntrypoint = readFileSync(new URL("../src/db/migrate.ts", import.meta.url), "utf8");
  assert.doesNotMatch(migrationEntrypoint, /\bdb\.execute(?:Multiple)?\s*\(/);
  assert.doesNotMatch(migrationEntrypoint, /schemaRemediationPayload\.operations\[/);
});

test("application remediation excludes foundational ledger schema DDL", () => {
  const schemaMigrationSource = readFileSync(
    new URL("../src/db/migrations/20260910.1_schema_remediations.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(schemaMigrationSource, /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.doesNotMatch(schemaMigrationSource, /CREATE TABLE IF NOT EXISTS schema_migration_locks/);
  assert.doesNotMatch(schemaMigrationSource, /ALTER TABLE\s+schema_migrations\b/i);
  assert.doesNotMatch(schemaMigrationSource, /ALTER TABLE\s+schema_migration_locks\b/i);
});

test("ledger bootstrap has a canonical checksum that changes with its immutable instructions", () => {
  const changedPayload = JSON.parse(JSON.stringify(ledgerBootstrapPayload)) as {
    operations: Array<{ sql?: string }>;
  };
  changedPayload.operations[0]!.sql = `${changedPayload.operations[0]!.sql}\n-- changed`;
  assert.equal(ledgerBootstrapChecksum, migrationChecksum(JSON.stringify(ledgerBootstrapPayload)));
  assert.notEqual(ledgerBootstrapChecksum, migrationChecksum(JSON.stringify(changedPayload)));
});

test("ledger bootstrap execution is exclusively sourced from its canonical payload", () => {
  const ledgerSource = readFileSync(new URL("../src/db/migration-ledger.ts", import.meta.url), "utf8");
  assert.doesNotMatch(ledgerSource, /\b(?:CREATE|ALTER)\s+(?:TABLE|INDEX)\b/i);
  assert.match(ledgerSource, /await applyLedgerBootstrap\(database\)/);
  assert.doesNotMatch(ledgerSource, /executeMultiple\s*\(\s*[`"']/);
  assert.equal(typeof applyLedgerBootstrap, "function");
});

test("concurrent runners serialize migration application", async () => {
  const concurrent = {
    version: "002_concurrent_probe",
    checksum: "sha256:concurrent-probe",
    apply: (database: typeof client) => database.execute("CREATE TABLE IF NOT EXISTS concurrent_probe (id INTEGER PRIMARY KEY)"),
  } satisfies VersionedMigration;

  await Promise.all([applyVersionedMigrations(client, [...migrations, concurrent]), applyVersionedMigrations(client, [...migrations, concurrent])]);
  const ledger = await client.execute({
    sql: "SELECT version FROM schema_migrations WHERE version = ?",
    args: [concurrent.version],
  });
  assert.equal(ledger.rows.length, 1);
});
