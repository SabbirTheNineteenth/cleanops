import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isUniqueActiveAssignmentError } from "../src/server/routes/assignments";
import { isPendingTriage } from "../src/server/triage";

const root = process.cwd();
const source = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

test("active site-worker assignments are uniquely enforced by the database migration", () => {
  const migration = source("src/db/migrate.ts");
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
  const migration = source("src/db/migrate.ts");
  assert.match(schema, /aiStatus: text\("ai_status"/);
  assert.match(migration, /ai_status TEXT NOT NULL DEFAULT 'pending'/);
  assert.equal(isPendingTriage("pending"), true);
  assert.equal(isPendingTriage("completed"), false);
});

test("incident routes use transactions for writes and queue AI work after the response path", () => {
  const routes = source("src/server/routes/incidents.ts");
  assert.match(routes, /await db\.transaction\(/);
  assert.match(routes, /enqueueIncidentTriage\(/);
  assert.doesNotMatch(routes, /await analyzeIncident\(/);
});
