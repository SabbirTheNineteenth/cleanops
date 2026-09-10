import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isUniqueActiveAssignmentError } from "../src/server/routes/assignments";
import { isPendingTriage } from "../src/server/triage";

const root = process.cwd();
const source = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("the Vercel catch-all imports the alias-free compiled API", () => {
  const manifest = JSON.parse(source("package.json")) as {
    type?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const functionSource = source("api/[...route].ts");
  const databaseSource = source("src/db/index.ts");
  const databaseRuntime = source("src/db/client-runtime.cjs");

  assert.equal(manifest.type, "module");
  assert.equal(manifest.optionalDependencies?.["@libsql/linux-x64-gnu"], undefined);
  assert.match(source("vercel.json"), /"includeFiles": "\{dist\/\*\*,node_modules\/libsql\/node_modules\/@libsql\/linux-x64-gnu\/\*\*\}"/);
  assert.doesNotMatch(databaseSource, /from "@libsql\/client"/);
  assert.doesNotMatch(databaseRuntime, /@libsql\/client\/web/);
  assert.match(databaseRuntime, /require\("@libsql\/client"\)/);
  assert.match(source("scripts/write-cjs-package.mjs"), /client-runtime\.cjs/);
  assert.match(manifest.scripts?.build ?? "", /write-cjs-package/);
  assert.match(functionSource, /\.\.\/dist\/server\/app\.js/);
  assert.doesNotMatch(functionSource, /@hono\/node-server\/vercel/);
  assert.match(functionSource, /for await \(const chunk of req\)/);
  assert.match(functionSource, /app\.fetch\(request\)/);
  assert.doesNotMatch(functionSource, /@\//);
  assert.match(source("vercel.json"), /"source": "\/api\/\(\.\*\)"/);
  assert.match(source("vercel.json"), /"destination": "\/api\/\[\.\.\.route\]\?route=\$1"/);
  assert.match(
    source("vercel.json"),
    /"includeFiles": "\{dist\/\*\*,node_modules\/libsql\/node_modules\/@libsql\/linux-x64-gnu\/\*\*\}"/,
  );
  assert.doesNotMatch(source("vercel.json"), /"includeFiles": "\{dist\/\*\*,node_modules\/@libsql\/linux-x64-gnu\/\*\*\}"/);
  assert.match(source("vercel.json"), /"framework": "hono"/);
});

test("the locked libSQL Linux native package matches the Vercel include path", () => {
  const lockfile = JSON.parse(source("package-lock.json")) as {
    packages?: Record<string, { version?: string; optionalDependencies?: Record<string, string> }>;
  };
  const packages = lockfile.packages ?? {};
  assert.equal(packages["node_modules/libsql"]?.optionalDependencies?.["@libsql/linux-x64-gnu"], "0.5.29");
  assert.equal(packages["node_modules/libsql/node_modules/@libsql/linux-x64-gnu"]?.version, "0.5.29");
  assert.match(source("vercel.json"), /node_modules\/libsql\/node_modules\/@libsql\/linux-x64-gnu/);
});

test("active site-worker assignments are uniquely enforced by the database migration", () => {
  const migration = source("src/db/migrations/20260910.1_schema_remediations.ts");
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_active_site_worker[\s\S]*ON assignments\(site_id, worker_id\) WHERE active = 1/,
  );
});

test("assignment unique-constraint failures are classified for a 409 response", () => {
  assert.equal(isUniqueActiveAssignmentError(new Error("UNIQUE constraint failed: assignments.site_id, assignments.worker_id")), true);
  assert.equal(isUniqueActiveAssignmentError(new Error("FOREIGN KEY constraint failed")), false);
});

test("incidents persist an observable pending triage status", () => {
  const schema = source("src/db/schema.ts");
  const migration = source("src/db/migrations/20260910.1_schema_remediations.ts");
  assert.match(schema, /aiStatus: text\("ai_status"/);
  assert.match(migration, /ai_status TEXT NOT NULL DEFAULT 'pending'/);
  assert.equal(isPendingTriage("pending"), true);
  assert.equal(isPendingTriage("completed"), false);
});

test("incident create and re-analysis atomically persist their triage outbox work", () => {
  const routes = source("src/server/routes/incidents.ts");
  assert.match(routes, /await db\.transaction\(async \(tx\) => \{[\s\S]*await enqueueIncidentTriage\(created\.id, tx\);[\s\S]*return created;/);
  assert.match(routes, /await db\.transaction\(async \(tx\) => \{[\s\S]*await enqueueIncidentTriage\(id, tx\);[\s\S]*return pending;/);
  assert.doesNotMatch(routes, /\}\);\s*await enqueueIncidentTriage\(/);
  assert.doesNotMatch(routes, /await analyzeIncident\(/);
});

test("AI triage is durable and only a secret-protected internal endpoint runs workers", () => {
  const triage = source("src/server/triage.ts");
  const app = source("src/server/app.ts");
  assert.doesNotMatch(triage, /setTimeout/);
  assert.match(triage, /triageOutbox/);
  assert.match(app, /\/internal\/triage/);
  assert.match(app, /CRON_SECRET/);
});

test("the protected worker performs bounded session retention without requiring Vercel Cron", () => {
  const app = source("src/server/app.ts");
  const vercel = source("vercel.json");
  assert.match(app, /import \{[^}]*pruneSessions[^}]*\} from "\.\/sessions"/);
  assert.match(app, /await Promise\.all\([\s\S]*pruneSessions\(sessionRetentionBatch\(process\.env\.SESSION_RETENTION_BATCH\)\)/);
  assert.doesNotMatch(vercel, /"crons"/);
});
