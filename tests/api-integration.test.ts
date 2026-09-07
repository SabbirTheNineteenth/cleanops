import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { and, eq, sql } from "drizzle-orm";

const testDirectory = mkdtempSync(join(tmpdir(), "cleanops-api-"));
const databasePath = join(testDirectory, "integration.db");

Reflect.set(process.env, "NODE_ENV", "test");
process.env.JWT_SECRET = "integration-test-secret-that-is-longer-than-32-characters";
process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
process.env.OPENROUTER_API_KEY = "";

type App = typeof import("../src/server/app").app;
type Database = typeof import("../src/db").db;
type Client = typeof import("../src/db").client;
type Schema = typeof import("../src/db/schema");
type HashPassword = typeof import("../src/lib/auth").hashPassword;

let app: App;
let db: Database;
let client: Client;
let schema: Schema;
let hashPassword: HashPassword;
let assignments: Schema["assignments"];
let auditLogs: Schema["auditLogs"];
let incidentEvents: Schema["incidentEvents"];
let incidents: Schema["incidents"];
let sessions: Schema["sessions"];
let sites: Schema["sites"];
let users: Schema["users"];
let workers: Schema["workers"];
const password = "IntegrationPass1";

let adminCookie = "";
let workerCookie = "";
let outsiderCookie = "";
let siteId = 0;
let workerId = 0;

async function request(path: string, init: RequestInit = {}, cookie?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return app.request(new Request(`http://cleanops.test/api${path}`, { ...init, headers }));
}

function cookieFrom(response: Response): string {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "expected the API to set a session cookie");
  return value.split(";", 1)[0]!;
}

async function waitForTriage(incidentId: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const incident = await db.select().from(incidents).where(eq(incidents.id, incidentId)).get();
    if (incident?.aiStatus === "completed" || incident?.aiStatus === "failed") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("incident triage did not settle before the integration test timeout");
}

async function login(email: string): Promise<string> {
  const response = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: { "user-agent": "CleanOps integration test" },
  });
  assert.equal(response.status, 200);
  return cookieFrom(response);
}

before(async () => {
  execFileSync(process.execPath, ["--import", "tsx", "src/db/migrate.ts"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
  const [appModule, dbModule, schemaModule, authModule] = await Promise.all([
    import("../src/server/app"),
    import("../src/db"),
    import("../src/db/schema"),
    import("../src/lib/auth"),
  ]);
  app = appModule.app;
  db = dbModule.db;
  client = dbModule.client;
  schema = schemaModule;
  hashPassword = authModule.hashPassword;
  ({ assignments, auditLogs, incidentEvents, incidents, sessions, sites, users, workers } = schema);

  const passwordHash = await hashPassword(password);
  const admin = await db
    .insert(users)
    .values({ name: "Integration Admin", email: "admin@example.test", passwordHash, role: "admin", status: "active" })
    .returning()
    .get();
  const workerUser = await db
    .insert(users)
    .values({ name: "Integration Worker", email: "worker@example.test", passwordHash, role: "user", status: "active" })
    .returning()
    .get();
  await db
    .insert(users)
    .values({ name: "Integration Outsider", email: "outsider@example.test", passwordHash, role: "user", status: "active" });
  const site = await db
    .insert(sites)
    .values({ name: "Integration Site", code: "INT-001", location: "Test floor" })
    .returning()
    .get();
  const worker = await db
    .insert(workers)
    .values({ userId: workerUser.id, name: workerUser.name, email: workerUser.email, role: "Field Technician" })
    .returning()
    .get();

  siteId = site.id;
  workerId = worker.id;
  adminCookie = await login(admin.email);
  workerCookie = await login(workerUser.email);
  outsiderCookie = await login("outsider@example.test");
});

after(async () => {
  await client.close();
  try {
    rmSync(testDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EBUSY") throw error;
  }
});

test("auth login establishes a database-backed session that /me and /sessions expose", async () => {
  const me = await request("/auth/me", {}, adminCookie);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, "admin@example.test");

  const listed = await request("/auth/sessions", {}, adminCookie);
  assert.equal(listed.status, 200);
  const sessionsPayload = await listed.json();
  assert.equal(sessionsPayload.data.length, 1);
  assert.equal(sessionsPayload.data[0].current, true);
  assert.equal(sessionsPayload.data[0].active, true);

  const sessionCount = await db.select({ total: sql<number>`count(*)` }).from(sessions).get();
  assert.equal(Number(sessionCount?.total), 3);
});

test("incident APIs enforce authentication and let only the assigned worker advance the workflow", async () => {
  const unauthorized = await request("/incidents", {
    method: "POST",
    body: JSON.stringify({ title: "Blocked request", siteId, severity: "low" }),
  });
  assert.equal(unauthorized.status, 401);

  const created = await request(
    "/incidents",
    {
      method: "POST",
      body: JSON.stringify({
        title: "Integration water leak",
        description: "Water is leaking beside the loading entrance.",
        category: "plumbing",
        siteId,
        severity: "high",
      }),
    },
    adminCookie,
  );
  assert.equal(created.status, 201);
  const incidentId = (await created.json()).incident.id as number;
  await waitForTriage(incidentId);

  const assigned = await request(
    `/incidents/${incidentId}`,
    { method: "PATCH", body: JSON.stringify({ assignedTo: workerId }) },
    adminCookie,
  );
  assert.equal(assigned.status, 200);
  assert.equal((await assigned.json()).incident.status, "assigned");

  const outsiderWork = await request(
    `/incidents/${incidentId}/work`,
    { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) },
    outsiderCookie,
  );
  assert.equal(outsiderWork.status, 403);

  const inProgress = await request(
    `/incidents/${incidentId}/work`,
    { method: "PATCH", body: JSON.stringify({ status: "in_progress" }) },
    workerCookie,
  );
  assert.equal(inProgress.status, 200);
  assert.equal((await inProgress.json()).incident.status, "in_progress");

  const resolved = await request(
    `/incidents/${incidentId}/work`,
    { method: "PATCH", body: JSON.stringify({ status: "resolved", resolutionNote: "Leak isolated and area dried." }) },
    workerCookie,
  );
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).incident.status, "resolved");

  const stored = await db.select().from(incidents).where(eq(incidents.id, incidentId)).get();
  assert.equal(stored?.status, "resolved");
  assert.equal(stored?.resolutionNote, "Leak isolated and area dried.");
});

test("assignment API rejects a duplicate active assignment without creating another row", async () => {
  const first = await request(
    "/assignments",
    { method: "POST", body: JSON.stringify({ siteId, workerId }) },
    adminCookie,
  );
  assert.equal(first.status, 201);

  const duplicate = await request(
    "/assignments",
    { method: "POST", body: JSON.stringify({ siteId, workerId }) },
    adminCookie,
  );
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, "Worker already assigned to this site");

  const count = await db
    .select({ total: sql<number>`count(*)` })
    .from(assignments)
    .where(and(eq(assignments.siteId, siteId), eq(assignments.workerId, workerId), eq(assignments.active, true)))
    .get();
  assert.equal(Number(count?.total), 1);
});

test("incident timeline and audit endpoints expose persisted workflow side effects", async () => {
  const incident = await db.select().from(incidents).where(eq(incidents.status, "resolved")).get();
  assert.ok(incident);

  const timeline = await request(`/incidents/${incident.id}/events`, {}, workerCookie);
  assert.equal(timeline.status, 200);
  const events = (await timeline.json()).data as Array<{ type: string; toValue: string | null }>;
  assert.deepEqual(
    events.filter((event) => event.type !== "ai").slice(0, 5).map((event) => [event.type, event.toValue]),
    [
      ["status", "resolved"],
      ["status", "in_progress"],
      ["status", "assigned"],
      ["assigned", "Integration Worker"],
      ["created", "high"],
    ],
  );

  const audit = await request("/audit?entity=incident", {}, adminCookie);
  assert.equal(audit.status, 200);
  const auditRows = (await audit.json()).data as Array<{ action: string; entityId: number | null }>;
  assert.ok(auditRows.some((row) => row.action === "create" && row.entityId === incident.id));
  assert.ok(auditRows.some((row) => row.action === "work_update" && row.entityId === incident.id));

  const persistedEvents = await db
    .select({ total: sql<number>`count(*)` })
    .from(incidentEvents)
    .where(eq(incidentEvents.incidentId, incident.id))
    .get();
  assert.ok(Number(persistedEvents?.total) >= 5);

  const persistedAudit = await db
    .select({ total: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(eq(auditLogs.entity, "incident"), eq(auditLogs.entityId, incident.id)))
    .get();
  assert.ok(Number(persistedAudit?.total) >= 4);
});
