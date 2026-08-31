import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { incidents, sites, workers, users } from "@/db/schema";
import { incidentSchema, incidentUpdateSchema, incidentWorkSchema } from "@/lib/validation";
import { analyzeIncident } from "../ai";
import { requireAuth, requireAdmin, type Variables } from "../middleware";

export const incidentRoutes = new Hono<{ Variables: Variables }>();

incidentRoutes.use("*", requireAuth);

function withJoins() {
  return db
    .select({
      id: incidents.id,
      title: incidents.title,
      description: incidents.description,
      category: incidents.category,
      status: incidents.status,
      severity: incidents.severity,
      siteId: incidents.siteId,
      siteName: sites.name,
      assignedTo: incidents.assignedTo,
      workerName: workers.name,
      reportedBy: incidents.reportedBy,
      reporterName: users.name,
      aiSummary: incidents.aiSummary,
      aiSeverity: incidents.aiSeverity,
      aiSuggestedAction: incidents.aiSuggestedAction,
      resolutionNote: incidents.resolutionNote,
      createdAt: incidents.createdAt,
      updatedAt: incidents.updatedAt,
      resolvedAt: incidents.resolvedAt,
    })
    .from(incidents)
    .leftJoin(sites, eq(incidents.siteId, sites.id))
    .leftJoin(workers, eq(incidents.assignedTo, workers.id))
    .leftJoin(users, eq(incidents.reportedBy, users.id));
}

incidentRoutes.get("/", async (c) => {
  const { status, severity, siteId } = c.req.query();
  let rows = await withJoins().orderBy(desc(incidents.createdAt)).all();
  if (status) rows = rows.filter((r) => r.status === status);
  if (severity) rows = rows.filter((r) => r.severity === severity);
  if (siteId) rows = rows.filter((r) => r.siteId === Number(siteId));
  return c.json({ incidents: rows });
});

incidentRoutes.get("/mine", async (c) => {
  const user = c.get("user");
  const worker = await db
    .select()
    .from(workers)
    .where(eq(workers.userId, Number(user.sub)))
    .get();
  if (!worker) return c.json({ incidents: [], worker: null });
  const rows = await withJoins()
    .where(eq(incidents.assignedTo, worker.id))
    .orderBy(desc(incidents.createdAt))
    .all();
  return c.json({ incidents: rows, worker: { id: worker.id, name: worker.name } });
});

incidentRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await withJoins().where(eq(incidents.id, id)).get();
  if (!row) return c.json({ error: "Incident not found" }, 404);
  return c.json({ incident: row });
});

incidentRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = incidentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { title, description, category, siteId, severity } = parsed.data;

  const site = await db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) return c.json({ error: "Site not found" }, 404);

  const ai = await analyzeIncident({
    title,
    description,
    category,
    siteName: site.name,
  });

  const row = await db
    .insert(incidents)
    .values({
      title,
      description,
      category,
      siteId,
      reportedBy: Number(user.sub),
      severity: severity ?? ai.severity,
      aiSummary: ai.summary,
      aiSeverity: ai.severity,
      aiSuggestedAction: ai.suggestedAction,
    })
    .returning()
    .get();

  return c.json({ incident: row, ai }, 201);
});

incidentRoutes.post("/:id/analyze", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.select().from(incidents).where(eq(incidents.id, id)).get();
  if (!row) return c.json({ error: "Incident not found" }, 404);
  const site = await db.select().from(sites).where(eq(sites.id, row.siteId)).get();

  const ai = await analyzeIncident({
    title: row.title,
    description: row.description,
    category: row.category,
    siteName: site?.name,
  });

  const updated = await db
    .update(incidents)
    .set({
      aiSummary: ai.summary,
      aiSeverity: ai.severity,
      aiSuggestedAction: ai.suggestedAction,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(incidents.id, id))
    .returning()
    .get();

  return c.json({ incident: updated, ai });
});

incidentRoutes.patch("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(incidents).where(eq(incidents.id, id)).get();
  if (!existing) return c.json({ error: "Incident not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const parsed = incidentUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { status, severity, assignedTo, resolutionNote } = parsed.data;

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (assignedTo !== undefined) {
    if (assignedTo !== null) {
      const worker = await db
        .select()
        .from(workers)
        .where(eq(workers.id, assignedTo))
        .get();
      if (!worker) return c.json({ error: "Worker not found" }, 404);
      patch.assignedTo = assignedTo;

      if (existing.status === "open") patch.status = "assigned";
    } else {
      patch.assignedTo = null;
    }
  }

  if (severity) patch.severity = severity;
  if (resolutionNote !== undefined) patch.resolutionNote = resolutionNote;

  if (status) {
    patch.status = status;
    patch.resolvedAt = status === "resolved" ? new Date().toISOString() : null;
  }

  const updated = await db
    .update(incidents)
    .set(patch)
    .where(eq(incidents.id, id))
    .returning()
    .get();

  return c.json({ incident: updated });
});

incidentRoutes.patch("/:id/work", async (c) => {
  const id = Number(c.req.param("id"));
  const user = c.get("user");

  const worker = await db
    .select()
    .from(workers)
    .where(eq(workers.userId, Number(user.sub)))
    .get();
  if (!worker) {
    return c.json({ error: "No worker profile linked to your account" }, 403);
  }

  const existing = await db.select().from(incidents).where(eq(incidents.id, id)).get();
  if (!existing) return c.json({ error: "Incident not found" }, 404);
  if (existing.assignedTo !== worker.id) {
    return c.json({ error: "This incident is not assigned to you" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = incidentWorkSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { status, resolutionNote } = parsed.data;

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (resolutionNote !== undefined) patch.resolutionNote = resolutionNote;
  if (status) {
    patch.status = status;
    patch.resolvedAt = status === "resolved" ? new Date().toISOString() : null;
  }

  const updated = await db
    .update(incidents)
    .set(patch)
    .where(eq(incidents.id, id))
    .returning()
    .get();

  return c.json({ incident: updated });
});

incidentRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.delete(incidents).where(eq(incidents.id, id)).returning().get();
  if (!row) return c.json({ error: "Incident not found" }, 404);
  return c.json({ ok: true });
});
