import { Hono } from "hono";
import { and, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { assignments, incidents, sites, workers } from "@/db/schema";
import { siteSchema } from "@/lib/validation";
import { slaInfo } from "@/lib/sla";
import { sqlNow } from "@/lib/time";
import { logAudit } from "../activity";
import {
  clampListQuery,
  listMeta,
  orderFor,
  parseListQuery,
  pickEnum,
  searchPattern,
} from "../query";
import { csvResponse, stamped, toCsv } from "../csv";
import { requireAuth, requireAdmin, type Variables } from "../middleware";

export const siteRoutes = new Hono<{ Variables: Variables }>();

siteRoutes.use("*", requireAuth);

const SORTABLE = ["createdAt", "name", "code", "status", "openIncidents"] as const;
const STATUSES = ["active", "inactive"] as const;

const openCount = sql<number>`(select count(*) from incidents where incidents.site_id = ${sites.id} and incidents.status != 'resolved')`;
const totalCount = sql<number>`(select count(*) from incidents where incidents.site_id = ${sites.id})`;
const crewCount = sql<number>`(select count(*) from assignments where assignments.site_id = ${sites.id} and assignments.active = 1)`;

const SORT_COLUMNS: Record<string, unknown> = {
  createdAt: sites.createdAt,
  name: sites.name,
  code: sites.code,
  status: sites.status,
  openIncidents: openCount,
};

function conditionsFor(query: Record<string, string>, search: string) {
  const conditions = [];
  const status = pickEnum(query.status, STATUSES);
  if (status) conditions.push(eq(sites.status, status));
  if (search) {
    const pattern = searchPattern(search);
    conditions.push(
      or(like(sites.name, pattern), like(sites.code, pattern), like(sites.location, pattern))!,
    );
  }
  return conditions;
}

siteRoutes.get("/", async (c) => {
  const query = parseListQuery(c, { sortable: SORTABLE, defaultSort: "name", defaultDir: "asc" });
  const conditions = conditionsFor(c.req.query(), query.q);
  const where = conditions.length ? and(...conditions) : undefined;
  const column = (SORT_COLUMNS[query.sort] ?? sites.name) as never;

  const countRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(sites)
    .where(where)
    .get();
  const total = Number(countRow?.total ?? 0);
  const pagedQuery = clampListQuery(query, total);
  const rows = await db
    .select({
        id: sites.id,
        name: sites.name,
        code: sites.code,
        location: sites.location,
        status: sites.status,
        createdAt: sites.createdAt,
        openIncidents: openCount,
        totalIncidents: totalCount,
        crewSize: crewCount,
    })
    .from(sites)
    .where(where)
    .orderBy(orderFor(column, query.dir))
    .limit(query.pageSize)
    .offset(pagedQuery.offset)
    .all();

  if (query.isExport) {
    const csv = toCsv(
      ["ID", "Name", "Code", "Location", "Status", "Open incidents", "Total incidents", "Crew", "Created"],
      rows.map((row) => [
        row.id,
        row.name,
        row.code,
        row.location,
        row.status,
        row.openIncidents,
        row.totalIncidents,
        row.crewSize,
        row.createdAt,
      ]),
    );
    await logAudit(c, { action: "export", entity: "site", detail: `${rows.length} rows` });
    return csvResponse(c, stamped("sites"), csv);
  }

  return c.json({ data: rows, meta: listMeta(pagedQuery, total) });
});

siteRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "Site not found" }, 404);

  const row = await db.select().from(sites).where(eq(sites.id, id)).get();
  if (!row) return c.json({ error: "Site not found" }, 404);

  const [crew, recent, tally] = await Promise.all([
    db
      .select({
        assignmentId: assignments.id,
        workerId: workers.id,
        name: workers.name,
        role: workers.role,
        phone: workers.phone,
        status: workers.status,
        assignedAt: assignments.assignedAt,
      })
      .from(assignments)
      .innerJoin(workers, eq(assignments.workerId, workers.id))
      .where(and(eq(assignments.siteId, id), eq(assignments.active, true)))
      .orderBy(workers.name)
      .all(),
    db
      .select({
        id: incidents.id,
        title: incidents.title,
        status: incidents.status,
        severity: incidents.severity,
        category: incidents.category,
        dueAt: incidents.dueAt,
        resolvedAt: incidents.resolvedAt,
        createdAt: incidents.createdAt,
        workerName: workers.name,
      })
      .from(incidents)
      .leftJoin(workers, eq(incidents.assignedTo, workers.id))
      .where(eq(incidents.siteId, id))
      .orderBy(sql`${incidents.createdAt} desc`)
      .limit(12)
      .all(),
    db
      .select({
        total: sql<number>`count(*)`,
        open: sql<number>`sum(case when ${incidents.status} != 'resolved' then 1 else 0 end)`,
        critical: sql<number>`sum(case when ${incidents.severity} = 'critical' then 1 else 0 end)`,
        overdue: sql<number>`sum(case when ${incidents.status} != 'resolved' and ${incidents.dueAt} is not null and ${incidents.dueAt} < ${sqlNow()} then 1 else 0 end)`,
      })
      .from(incidents)
      .where(eq(incidents.siteId, id))
      .get(),
  ]);

  return c.json({
    site: row,
    crew,
    incidents: recent.map((item) => ({ ...item, sla: slaInfo(item) })),
    stats: {
      total: Number(tally?.total ?? 0),
      open: Number(tally?.open ?? 0),
      critical: Number(tally?.critical ?? 0),
      overdue: Number(tally?.overdue ?? 0),
    },
  });
});

siteRoutes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = siteSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const code = parsed.data.code.toUpperCase();
  const existing = await db.select({ id: sites.id }).from(sites).where(eq(sites.code, code)).get();
  if (existing) return c.json({ error: "Site code already exists" }, 409);

  const row = await db.insert(sites).values({ ...parsed.data, code }).returning().get();
  await logAudit(c, {
    action: "create",
    entity: "site",
    entityId: row.id,
    detail: `${row.name} (${row.code})`,
  });
  return c.json({ site: row }, 201);
});

siteRoutes.patch("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const parsed = siteSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const patch = { ...parsed.data };
  if (patch.code) {
    patch.code = patch.code.toUpperCase();
    const clash = await db
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.code, patch.code))
      .get();
    if (clash && clash.id !== id) return c.json({ error: "Site code already exists" }, 409);
  }

  const row = await db.update(sites).set(patch).where(eq(sites.id, id)).returning().get();
  if (!row) return c.json({ error: "Site not found" }, 404);
  await logAudit(c, {
    action: "update",
    entity: "site",
    entityId: id,
    detail: Object.keys(patch).join(", ") || "no change",
  });
  return c.json({ site: row });
});

siteRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const openRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(incidents)
    .where(and(eq(incidents.siteId, id), sql`${incidents.status} != 'resolved'`))
    .get();
  if (Number(openRow?.total ?? 0) > 0) {
    return c.json(
      { error: "Resolve or move the open incidents at this site before deleting it" },
      409,
    );
  }

  const row = await db.delete(sites).where(eq(sites.id, id)).returning().get();
  if (!row) return c.json({ error: "Site not found" }, 404);
  await logAudit(c, { action: "delete", entity: "site", entityId: id, detail: row.name });
  return c.json({ ok: true });
});
