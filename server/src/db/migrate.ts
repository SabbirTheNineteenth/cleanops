import "dotenv/config";
import { createClient } from "@libsql/client";
import { applyVersionedMigrations } from "./migration-ledger";
import {
  applySchemaRemediations,
  schemaRemediationChecksum,
} from "./migrations/20260910.1_schema_remediations";

const url = process.env.DATABASE_URL || "file:cleanops.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const db = createClient({ url, authToken });

// This checksum identifies this imperative, idempotent migration. Any schema
// change belongs in a new version with its own checksum; do not edit an applied version.
const schemaRemediation = {
  version: "20260910.1_schema_remediations",
  checksum: schemaRemediationChecksum,
  apply: applySchemaRemediations,
};

async function main() {
  await applyVersionedMigrations(db, [schemaRemediation]);
  console.log(`Migrated schema into ${url}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
