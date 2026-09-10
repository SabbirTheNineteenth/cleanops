import { Hono } from "hono";
import { and, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { assignments, sites, workers } from "@/db/schema";
import { assignmentSchema } from "@/lib/validation";
import { sqlNow } from "@/lib/time";
import { logAudit, notify } from "../activity";
import {
  clampListQuery,
  listMeta,
  optionalId,
  orderFor,
  parseListQuery,
  searchPattern,
} from "../query";
import { csvResponse, stamped, toCsv } from "../csv";
import { requireAuth, requireAdmin, type Variables } from "../middleware";

export const assignmentRoutes = new Hono<{ Variables: Variables }>();

assignmentRoutes.use("*", requireAuth);

const SORTABLE = ["assignedAt", "siteName", "workerName"] as const;

const SORT_COLUMNS: Record<string, unknown> = {
  assignedAt: assignments.assignedAt,
  siteName: sites.name,
  workerName: workers.name,
};

export function isUniqueActiveAssignmentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /(?:unique constraint|sqlite_constraint_unique)/i.test(message)
    && /assignments\.(?:site_id|worker_id)|idx_assignments_active_site_worker/i.test(message);
}

function conditionsFor(query: Record<string, string>, search: string) {
  const conditions = [];
  const siteId = optionalId(query.siteId);
  const workerId = optionalId(query.workerId);

  conditions.push(query.state === "past" ? eq(assignments.active, false) : eq(assignments.active, true));
  if (siteId) conditions.push(eq(assignments.siteId, siteId));
  if (workerId) conditions.push(eq(assignments.workerId, workerId));
  if (search) {
    const pattern = searchPattern(search);
    conditions.push(
      or(
        like(sites.name, pattern),
        like(sites.code, pattern),
        like(workers.name, pattern),
        like(workers.role, pattern),
      )!,
    );
  }
  return conditions;
}

assignmentRoutes.get("/", async (c) => {
  const query = parseListQuery(c, {
    sortable: SORTABLE,
    defaultSort: "assignedAt",
    defaultPageSize: 20,
  });
  const conditions = conditionsFor(c.req.query(), query.q);
  const where = and(...conditions);
  const column = (SORT_COLUMNS[query.sort] ?? assignments.assignedAt) as never;

  const countRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(assignments)
    .leftJoin(sites, eq(assignments.siteId, sites.id))
    .leftJoin(workers, eq(assignments.workerId, workers.id))
    .where(where)
    .get();
  const total = Number(countRow?.total ?? 0);
  const pagedQuery = clampListQuery(query, total);
  const rows = await db
    .select({
        id: assignments.id,
        siteId: assignments.siteId,
        workerId: assignments.workerId,
        active: assignments.active,
        assignedAt: assignments.assignedAt,
        unassignedAt: assignments.unassignedAt,
        siteName: sites.name,
        siteCode: sites.code,
        workerName: workers.name,
        workerRole: workers.role,
        workerStatus: workers.status,
    })
    .from(assignments)
    .leftJoin(sites, eq(assignments.siteId, sites.id))
    .leftJoin(workers, eq(assignments.workerId, workers.id))
    .where(where)
    .orderBy(orderFor(column, query.dir))
    .limit(query.pageSize)
    .offset(pagedQuery.offset)
    .all();

  if (query.isExport) {
    const csv = toCsv(
      ["ID", "Site", "Code", "Worker", "Role", "Active", "Assigned", "Unassigned"],
      rows.map((row) => [
        row.id,
        row.siteName ?? "",
        row.siteCode ?? "",
        row.workerName ?? "",
        row.workerRole ?? "",
        row.active ? "yes" : "no",
        row.assignedAt,
        row.unassignedAt ?? "",
      ]),
    );
    await logAudit(c, { action: "export", entity: "assignment", detail: `${rows.length} rows` });
    return csvResponse(c, stamped("assignments"), csv);
  }

  return c.json({ data: rows, meta: listMeta(pagedQuery, total) });
});

assignmentRoutes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = assignmentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { siteId, workerId } = parsed.data;

  const site = await db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) return c.json({ error: "Site not found" }, 404);
  const worker = await db.select().from(workers).where(eq(workers.id, workerId)).get();
  if (!worker) return c.json({ error: "Worker not found" }, 404);
  if (worker.status === "off") {
    return c.json({ error: "This worker is marked off duty" }, 409);
  }

  const dup = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(
      and(
        eq(assignments.siteId, siteId),
        eq(assignments.workerId, workerId),
        eq(assignments.active, true),
      ),
    )
    .get();
  if (dup) return c.json({ error: "Worker already assigned to this site" }, 409);

  let row: typeof assignments.$inferSelect;
  try {
    row = await db
      .insert(assignments)
      .values({ siteId, workerId, active: true })
      .returning()
      .get();
  } catch (error) {
    if (isUniqueActiveAssignmentError(error)) {
      return c.json({ error: "Worker already assigned to this site" }, 409);
    }
    throw error;
  }

  await db.update(workers).set({ status: "assigned" }).where(eq(workers.id, workerId));

  if (worker.userId) {
    await notify([
      {
        userId: worker.userId,
        type: "assignment",
        title: `You were added to ${site.name}`,
        body: `${site.code} · ${site.location || "no location on file"}`,
        link: `/sites/${site.id}`,
      },
    ]);
  }
  await logAudit(c, {
    action: "assign",
    entity: "assignment",
    entityId: row.id,
    detail: `${worker.name} → ${site.name}`,
  });

  return c.json({ assignment: row }, 201);
});

assignmentRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db
    .select({
      id: assignments.id,
      siteId: assignments.siteId,
      workerId: assignments.workerId,
      active: assignments.active,
      siteName: sites.name,
      workerName: workers.name,
      workerUserId: workers.userId,
    })
    .from(assignments)
    .leftJoin(sites, eq(assignments.siteId, sites.id))
    .leftJoin(workers, eq(assignments.workerId, workers.id))
    .where(eq(assignments.id, id))
    .get();
  if (!existing) return c.json({ error: "Assignment not found" }, 404);
  if (!existing.active) return c.json({ error: "Assignment is already closed" }, 409);

  await db
    .update(assignments)
    .set({ active: false, unassignedAt: sqlNow() })
    .where(eq(assignments.id, id));

  const stillActive = await db
    .select({ id: assignments.id })
    .from(assignments)
    .where(and(eq(assignments.workerId, existing.workerId), eq(assignments.active, true)))
    .get();
  if (!stillActive) {
    await db.update(workers).set({ status: "available" }).where(eq(workers.id, existing.workerId));
  }

  if (existing.workerUserId) {
    await notify([
      {
        userId: existing.workerUserId,
        type: "assignment",
        title: `You were removed from ${existing.siteName ?? "a site"}`,
        body: "Your active site list has been updated.",
        link: "/dashboard",
      },
    ]);
  }
  await logAudit(c, {
    action: "unassign",
    entity: "assignment",
    entityId: id,
    detail: `${existing.workerName ?? "worker"} ← ${existing.siteName ?? "site"}`,
  });

  return c.json({ ok: true });
});
