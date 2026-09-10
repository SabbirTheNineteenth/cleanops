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
process.env.CRON_SECRET = "integration-cron-secret";

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
let triageOutbox: Schema["triageOutbox"];
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
    const trigger = await request("/internal/triage", {
      headers: { authorization: "Bearer integration-cron-secret" },
    });
    assert.equal(trigger.status, 200);
    const incident = await db.select().from(incidents).where(eq(incidents.id, incidentId)).get();
    if (incident?.aiStatus === "completed" || incident?.aiStatus === "failed") return;
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
  ({ assignments, auditLogs, incidentEvents, incidents, sessions, sites, triageOutbox, users, workers } = schema);

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

test("every API response carries a request identifier", async () => {
  const response = await request("/health");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-request-id") ?? "", /\S/);
});

test("triage worker endpoint fails closed without its internal credential", async () => {
  const response = await request("/internal/triage");
  assert.equal(response.status, 404);
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

test("protected cron prunes only the configured bounded session retention batch", async () => {
  const expiredIds = ["expired-session-one", "expired-session-two"];
  await db.insert(sessions).values(expiredIds.map((id) => ({
    id,
    userId: 1,
    ip: "test",
    userAgent: "test",
    expiresAt: "2000-01-01 00:00:00",
  })));
  process.env.SESSION_RETENTION_BATCH = "1";
  try {
    const response = await request("/internal/triage", {
      headers: { authorization: "Bearer integration-cron-secret" },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).pruned, 1);
    const remaining = await db.select({ id: sessions.id }).from(sessions).all();
    assert.equal(remaining.filter((session) => expiredIds.includes(session.id)).length, 1);
  } finally {
    delete process.env.SESSION_RETENTION_BATCH;
    await db.delete(sessions).where(sql`${sessions.id} in (${sql.join(expiredIds.map((id) => sql`${id}`), sql`, `)})`);
  }
});

test("incident creation and re-analysis persist triage work before their transactions commit", async () => {
  const created = await request(
    "/incidents",
    { method: "POST", body: JSON.stringify({ title: "Transactional triage incident", siteId, severity: "medium" }) },
    adminCookie,
  );
  assert.equal(created.status, 201);
  const incident = (await created.json()).incident as { id: number };
  assert.equal((await db.select().from(triageOutbox).where(eq(triageOutbox.incidentId, incident.id)).all()).length, 1);

  const analyzed = await request(`/incidents/${incident.id}/analyze`, { method: "POST" }, adminCookie);
  assert.equal(analyzed.status, 202);
  assert.equal((await db.select().from(triageOutbox).where(eq(triageOutbox.incidentId, incident.id)).all()).length, 2);
});

test("incident collaboration reads reject an unrelated authenticated user", async () => {
  const created = await request(
    "/incidents",
    {
      method: "POST",
      body: JSON.stringify({ title: "Private collaboration incident", siteId, severity: "medium" }),
    },
    adminCookie,
  );
  assert.equal(created.status, 201);
  const incidentId = (await created.json()).incident.id as number;

  for (const resource of ["comments", "events", "tasks"]) {
    const response = await request(`/incidents/${incidentId}/${resource}`, {}, outsiderCookie);
    assert.equal(response.status, 403, `${resource} must remain private to incident participants`);
  }
});

test("incident list and detail expose only reported or assigned incidents to non-admins", async () => {
  const visible = await request(
    "/incidents",
    { method: "POST", body: JSON.stringify({ title: "Worker-visible incident", siteId, severity: "medium" }) },
    adminCookie,
  );
  assert.equal(visible.status, 201);
  const visibleIncident = (await visible.json()).incident as { id: number; version: number };
  const assignment = await request(
    `/incidents/${visibleIncident.id}`,
    { method: "PATCH", body: JSON.stringify({ assignedTo: workerId, version: visibleIncident.version }) },
    adminCookie,
  );
  assert.equal(assignment.status, 200);

  const hidden = await request(
    "/incidents",
    { method: "POST", body: JSON.stringify({ title: "Outsider-hidden incident", siteId, severity: "medium" }) },
    adminCookie,
  );
  assert.equal(hidden.status, 201);
  const hiddenId = (await hidden.json()).incident.id as number;

  const workerList = await request("/incidents", {}, workerCookie);
  assert.equal(workerList.status, 200);
  assert.ok((await workerList.json()).data.some((incident: { id: number }) => incident.id === visibleIncident.id));

  const outsiderList = await request("/incidents", {}, outsiderCookie);
  assert.equal(outsiderList.status, 200);
  assert.ok(!(await outsiderList.json()).data.some((incident: { id: number }) => incident.id === hiddenId));

  assert.equal((await request(`/incidents/${hiddenId}`, {}, outsiderCookie)).status, 403);
  assert.equal((await request(`/incidents/${hiddenId}`, {}, adminCookie)).status, 200);
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
  const createdIncident = (await created.json()).incident as { id: number; version: number };
  const incidentId = createdIncident.id;
  await waitForTriage(incidentId);

  const assigned = await request(
    `/incidents/${incidentId}`,
    { method: "PATCH", body: JSON.stringify({ assignedTo: workerId, version: createdIncident.version }) },
    adminCookie,
  );
  assert.equal(assigned.status, 200);
  const assignedIncident = (await assigned.json()).incident as { status: string; version: number };
  assert.equal(assignedIncident.status, "assigned");

  const outsiderWork = await request(
    `/incidents/${incidentId}/work`,
    { method: "PATCH", body: JSON.stringify({ status: "in_progress", version: assignedIncident.version }) },
    outsiderCookie,
  );
  assert.equal(outsiderWork.status, 403);

  const inProgress = await request(
    `/incidents/${incidentId}/work`,
    { method: "PATCH", body: JSON.stringify({ status: "in_progress", version: assignedIncident.version }) },
    workerCookie,
  );
  assert.equal(inProgress.status, 200);
  const inProgressIncident = (await inProgress.json()).incident as { status: string; version: number };
  assert.equal(inProgressIncident.status, "in_progress");

  const resolved = await request(
    `/incidents/${incidentId}/work`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "resolved",
        resolutionNote: "Leak isolated and area dried.",
        version: inProgressIncident.version,
      }),
    },
    workerCookie,
  );
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).incident.status, "resolved");

  const stored = await db.select().from(incidents).where(eq(incidents.id, incidentId)).get();
  assert.equal(stored?.status, "resolved");
  assert.equal(stored?.resolutionNote, "Leak isolated and area dried.");
});

test("incident updates reject stale versions without creating extra workflow side effects", async () => {
  const created = await request(
    "/incidents",
    {
      method: "POST",
      body: JSON.stringify({ title: "Concurrent update test", siteId, severity: "medium" }),
    },
    adminCookie,
  );
  assert.equal(created.status, 201);
  const incident = (await created.json()).incident as { id: number; version: number };
  await waitForTriage(incident.id);

  const first = await request(
    `/incidents/${incident.id}`,
    { method: "PATCH", body: JSON.stringify({ severity: "high", version: incident.version }) },
    adminCookie,
  );
  assert.equal(first.status, 200);

  const stale = await request(
    `/incidents/${incident.id}`,
    { method: "PATCH", body: JSON.stringify({ severity: "critical", version: incident.version }) },
    adminCookie,
  );
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error, "Incident changed. Refresh and try again.");

  const stored = await db.select().from(incidents).where(eq(incidents.id, incident.id)).get();
  assert.equal(stored?.severity, "high");
  assert.equal(stored?.version, incident.version + 1);
  const severityEvents = await db
    .select({ total: sql<number>`count(*)` })
    .from(incidentEvents)
    .where(and(eq(incidentEvents.incidentId, incident.id), eq(incidentEvents.type, "severity")))
    .get();
  assert.equal(Number(severityEvents?.total), 1);
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

test("admin demotion is atomic and never leaves the workspace without an active admin", async () => {
  const pendingAdmin = await db
    .insert(users)
    .values({
      name: "Pending Admin",
      email: "pending-admin@example.test",
      passwordHash: await hashPassword(password),
      role: "admin",
      status: "pending",
    })
    .returning({ id: users.id })
    .get();
  const pendingDemotion = await request(`/users/${pendingAdmin.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "user" }),
  }, adminCookie);
  assert.equal(pendingDemotion.status, 200);

  const createAdmin = async (name: string, email: string) => {
    const response = await request(
      "/users",
      { method: "POST", body: JSON.stringify({ name, email, password, role: "admin" }) },
      adminCookie,
    );
    assert.equal(response.status, 201);
    return (await response.json()).user as { id: number; email: string };
  };

  const second = await createAdmin("Atomic Admin Two", "atomic-two@example.test");
  const third = await createAdmin("Atomic Admin Three", "atomic-three@example.test");
  const [secondCookie, thirdCookie] = await Promise.all([login(second.email), login(third.email)]);

  const initial = await db.select({ id: users.id }).from(users).where(eq(users.email, "admin@example.test")).get();
  assert.ok(initial);
  const demoteInitial = await request(`/users/${initial.id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: "user" }),
  }, secondCookie);
  assert.equal(demoteInitial.status, 200);

  const outcomes = await Promise.all([
    request(`/users/${third.id}`, { method: "PATCH", body: JSON.stringify({ role: "user" }) }, secondCookie),
    request(`/users/${second.id}`, { method: "PATCH", body: JSON.stringify({ role: "user" }) }, thirdCookie),
  ]);
  assert.deepEqual(outcomes.map((response) => response.status).sort(), [200, 400]);

  const activeAdmins = await db
    .select({ total: sql<number>`count(*)` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active")))
    .get();
  assert.equal(Number(activeAdmins?.total), 1);
});
