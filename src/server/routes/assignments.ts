import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assignments, sites, workers } from "@/db/schema";
import { assignmentSchema } from "@/lib/validation";
import { requireAuth, requireAdmin, type Variables } from "../middleware";

export const assignmentRoutes = new Hono<{ Variables: Variables }>();

assignmentRoutes.use("*", requireAuth);

assignmentRoutes.get("/", async (c) => {
  const siteId = c.req.query("siteId");
  const workerId = c.req.query("workerId");

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
    })
    .from(assignments)
    .leftJoin(sites, eq(assignments.siteId, sites.id))
    .leftJoin(workers, eq(assignments.workerId, workers.id))
    .orderBy(desc(assignments.assignedAt))
    .all();

  let filtered = rows.filter((r) => r.active);
  if (siteId) filtered = filtered.filter((r) => r.siteId === Number(siteId));
  if (workerId)
    filtered = filtered.filter((r) => r.workerId === Number(workerId));

  return c.json({ assignments: filtered });
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

  const dup = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.siteId, siteId),
        eq(assignments.workerId, workerId),
        eq(assignments.active, true),
      ),
    )
    .get();
  if (dup)
    return c.json({ error: "Worker already assigned to this site" }, 409);

  const row = await db
    .insert(assignments)
    .values({ siteId, workerId, active: true })
    .returning()
    .get();

  await db.update(workers)
    .set({ status: "assigned" })
    .where(eq(workers.id, workerId))
    .run();

  return c.json({ assignment: row }, 201);
});

assignmentRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, id))
    .get();
  if (!existing) return c.json({ error: "Assignment not found" }, 404);

  await db.update(assignments)
    .set({ active: false, unassignedAt: new Date().toISOString() })
    .where(eq(assignments.id, id))
    .run();

  const stillActive = await db
    .select()
    .from(assignments)
    .where(
      and(
        eq(assignments.workerId, existing.workerId),
        eq(assignments.active, true),
      ),
    )
    .get();
  if (!stillActive) {
    await db.update(workers)
      .set({ status: "available" })
      .where(eq(workers.id, existing.workerId))
      .run();
  }

  return c.json({ ok: true });
});
