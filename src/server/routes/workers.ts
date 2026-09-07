import { Hono } from "hono";
import { and, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { assignments, incidents, sites, users, workers } from "@/db/schema";
import { workerSchema } from "@/lib/validation";
import { slaInfo } from "@/lib/sla";
import { sqlNow } from "@/lib/time";
import { logAudit } from "../activity";
import {
  clampListQuery,
  listMeta,
  optionalId,
  orderFor,
  parseListQuery,
  pickEnum,
  searchPattern,
} from "../query";
import { csvResponse, stamped, toCsv } from "../csv";
import { requireAuth, requireAdmin, type Variables } from "../middleware";

export const workerRoutes = new Hono<{ Variables: Variables }>();

workerRoutes.use("*", requireAuth);

const SORTABLE = ["createdAt", "name", "role", "status", "openIncidents"] as const;
const STATUSES = ["available", "assigned", "off"] as const;

const openLoad = sql<number>`(select count(*) from incidents where incidents.assigned_to = ${workers.id} and incidents.status != 'resolved')`;
const resolvedLoad = sql<number>`(select count(*) from incidents where incidents.assigned_to = ${workers.id} and incidents.status = 'resolved')`;
const siteLoad = sql<number>`(select count(*) from assignments where assignments.worker_id = ${workers.id} and assignments.active = 1)`;

const SORT_COLUMNS: Record<string, unknown> = {
  createdAt: workers.createdAt,
  name: workers.name,
  role: workers.role,
  status: workers.status,
  openIncidents: openLoad,
};

function conditionsFor(query: Record<string, string>, search: string) {
  const conditions = [];
  const status = pickEnum(query.status, STATUSES);
  const siteId = optionalId(query.siteId);
  if (status) conditions.push(eq(workers.status, status));
  if (query.role) conditions.push(eq(workers.role, query.role.slice(0, 60)));
  if (query.linked === "1") conditions.push(sql`${workers.userId} is not null`);
  if (query.linked === "0") conditions.push(sql`${workers.userId} is null`);
  if (siteId) {
    conditions.push(
      sql`exists (select 1 from assignments where assignments.worker_id = ${workers.id} and assignments.site_id = ${siteId} and assignments.active = 1)`,
    );
  }
  if (search) {
    const pattern = searchPattern(search);
    conditions.push(
      or(
        like(workers.name, pattern),
        like(workers.email, pattern),
        like(workers.role, pattern),
        like(workers.phone, pattern),
      )!,
    );
  }
  return conditions;
}

workerRoutes.get("/", async (c) => {
  const query = parseListQuery(c, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });
  const conditions = conditionsFor(c.req.query(), query.q);
  const where = conditions.length ? and(...conditions) : undefined;
  const column = (SORT_COLUMNS[query.sort] ?? workers.name) as never;

  const countRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(workers)
    .where(where)
    .get();
  const total = Number(countRow?.total ?? 0);
  const pagedQuery = clampListQuery(query, total);
  const rows = await db
    .select({
        id: workers.id,
        userId: workers.userId,
        name: workers.name,
        email: workers.email,
        phone: workers.phone,
        role: workers.role,
        status: workers.status,
        createdAt: workers.createdAt,
        openIncidents: openLoad,
        resolvedIncidents: resolvedLoad,
        siteCount: siteLoad,
    })
    .from(workers)
    .where(where)
    .orderBy(orderFor(column, query.dir))
    .limit(query.pageSize)
    .offset(pagedQuery.offset)
    .all();

  if (query.isExport) {
    const csv = toCsv(
      ["ID", "Name", "Email", "Phone", "Role", "Status", "Open", "Resolved", "Sites", "Linked account", "Created"],
      rows.map((row) => [
        row.id,
        row.name,
        row.email,
        row.phone,
        row.role,
        row.status,
        row.openIncidents,
        row.resolvedIncidents,
        row.siteCount,
        row.userId ? "yes" : "no",
        row.createdAt,
      ]),
    );
    await logAudit(c, { action: "export", entity: "worker", detail: `${rows.length} rows` });
    return csvResponse(c, stamped("workers"), csv);
  }

  return c.json({ data: rows, meta: listMeta(pagedQuery, total) });
});

workerRoutes.get("/roles", async (c) => {
  const rows = await db.selectDistinct({ role: workers.role }).from(workers).orderBy(workers.role).all();
  return c.json({ roles: rows.map((row) => row.role).filter(Boolean) });
});

workerRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "Worker not found" }, 404);

  const row = await db
    .select({
      id: workers.id,
      userId: workers.userId,
      name: workers.name,
      email: workers.email,
      phone: workers.phone,
      role: workers.role,
      status: workers.status,
      createdAt: workers.createdAt,
      accountStatus: users.status,
    })
    .from(workers)
    .leftJoin(users, eq(workers.userId, users.id))
    .where(eq(workers.id, id))
    .get();
  if (!row) return c.json({ error: "Worker not found" }, 404);

  const [siteRows, recent, tally] = await Promise.all([
    db
      .select({
        assignmentId: assignments.id,
        siteId: sites.id,
        name: sites.name,
        code: sites.code,
        location: sites.location,
        assignedAt: assignments.assignedAt,
      })
      .from(assignments)
      .innerJoin(sites, eq(assignments.siteId, sites.id))
      .where(and(eq(assignments.workerId, id), eq(assignments.active, true)))
      .orderBy(sites.name)
      .all(),
    db
      .select({
        id: incidents.id,
        title: incidents.title,
        status: incidents.status,
        severity: incidents.severity,
        dueAt: incidents.dueAt,
        resolvedAt: incidents.resolvedAt,
        createdAt: incidents.createdAt,
        siteName: sites.name,
      })
      .from(incidents)
      .leftJoin(sites, eq(incidents.siteId, sites.id))
      .where(eq(incidents.assignedTo, id))
      .orderBy(sql`${incidents.createdAt} desc`)
      .limit(12)
      .all(),
    db
      .select({
        total: sql<number>`count(*)`,
        open: sql<number>`sum(case when ${incidents.status} != 'resolved' then 1 else 0 end)`,
        resolved: sql<number>`sum(case when ${incidents.status} = 'resolved' then 1 else 0 end)`,
        overdue: sql<number>`sum(case when ${incidents.status} != 'resolved' and ${incidents.dueAt} is not null and ${incidents.dueAt} < ${sqlNow()} then 1 else 0 end)`,
      })
      .from(incidents)
      .where(eq(incidents.assignedTo, id))
      .get(),
  ]);

  return c.json({
    worker: row,
    sites: siteRows,
    incidents: recent.map((item) => ({ ...item, sla: slaInfo(item) })),
    stats: {
      total: Number(tally?.total ?? 0),
      open: Number(tally?.open ?? 0),
      resolved: Number(tally?.resolved ?? 0),
      overdue: Number(tally?.overdue ?? 0),
    },
  });
});

workerRoutes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = workerSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const email = parsed.data.email.toLowerCase();
  const existing = await db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.email, email))
    .get();
  if (existing) return c.json({ error: "Worker email already exists" }, 409);

  const account = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  const linked = account
    ? await db.select({ id: workers.id }).from(workers).where(eq(workers.userId, account.id)).get()
    : null;

  const row = await db
    .insert(workers)
    .values({ ...parsed.data, email, userId: account && !linked ? account.id : null })
    .returning()
    .get();
  await logAudit(c, {
    action: "create",
    entity: "worker",
    entityId: row.id,
    detail: `${row.name} (${row.role})`,
  });
  return c.json({ worker: row }, 201);
});

workerRoutes.patch("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const parsed = workerSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const patch = { ...parsed.data };
  if (patch.email) {
    patch.email = patch.email.toLowerCase();
    const clash = await db
      .select({ id: workers.id })
      .from(workers)
      .where(eq(workers.email, patch.email))
      .get();
    if (clash && clash.id !== id) return c.json({ error: "Worker email already exists" }, 409);
  }

  const row = await db.update(workers).set(patch).where(eq(workers.id, id)).returning().get();
  if (!row) return c.json({ error: "Worker not found" }, 404);
  await logAudit(c, {
    action: "update",
    entity: "worker",
    entityId: id,
    detail: Object.keys(patch).join(", ") || "no change",
  });
  return c.json({ worker: row });
});

workerRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const openRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(incidents)
    .where(and(eq(incidents.assignedTo, id), sql`${incidents.status} != 'resolved'`))
    .get();
  if (Number(openRow?.total ?? 0) > 0) {
    return c.json({ error: "Reassign this worker's open incidents before deleting" }, 409);
  }

  const row = await db.delete(workers).where(eq(workers.id, id)).returning().get();
  if (!row) return c.json({ error: "Worker not found" }, 404);
  await logAudit(c, { action: "delete", entity: "worker", entityId: id, detail: row.name });
  return c.json({ ok: true });
});
