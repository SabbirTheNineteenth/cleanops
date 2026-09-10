import { Hono } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  incidentComments,
  incidentEvents,
  incidentTasks,
  incidents,
  users,
  workers,
} from "@/db/schema";
import { commentSchema, taskSchema, taskUpdateSchema } from "@/lib/validation";
import { sqlNow } from "@/lib/time";
import { logAudit, logEvent, notify, notifyAdmins } from "../activity";
import { RATE_RULES, consumeRateLimit, retryAfterMessage } from "../ratelimit";
import { clampListQuery, listMeta, parseListQuery } from "../query";
import { requireAuth, type AppContext, type Variables } from "../middleware";

export const collabRoutes = new Hono<{ Variables: Variables }>();

collabRoutes.use("*", requireAuth);

const NOT_INVOLVED =
  "Only an admin, the reporter, or the assigned worker can update this incident";

interface Actor {
  id: number;
  name: string;
  email: string;
  role: string;
  workerId: number | null;
}

async function loadActor(c: AppContext): Promise<Actor> {
  const user = c.get("user");
  const id = Number(user.sub);
  const worker = await db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.userId, id))
    .get();
  return { id, name: user.name, email: user.email, role: user.role, workerId: worker?.id ?? null };
}

async function loadIncident(id: number) {
  if (!Number.isFinite(id)) return null;
  return db
    .select({
      id: incidents.id,
      title: incidents.title,
      status: incidents.status,
      reportedBy: incidents.reportedBy,
      assignedTo: incidents.assignedTo,
    })
    .from(incidents)
    .where(eq(incidents.id, id))
    .get();
}

function isOwner(
  incident: { reportedBy: number; assignedTo: number | null },
  actor: Actor,
): boolean {
  if (actor.role === "admin") return true;
  if (incident.reportedBy === actor.id) return true;
  return Boolean(actor.workerId && incident.assignedTo === actor.workerId);
}

async function watcherIds(
  incident: { reportedBy: number; assignedTo: number | null },
  exceptId: number,
): Promise<number[]> {
  const ids = new Set<number>();
  if (incident.reportedBy !== exceptId) ids.add(incident.reportedBy);
  if (incident.assignedTo) {
    const worker = await db
      .select({ userId: workers.userId })
      .from(workers)
      .where(eq(workers.id, incident.assignedTo))
      .get();
    if (worker?.userId && worker.userId !== exceptId) ids.add(worker.userId);
  }
  return Array.from(ids);
}

collabRoutes.get("/:id/comments", async (c) => {
  const id = Number(c.req.param("id"));
  const incident = await loadIncident(id);
  if (!incident) return c.json({ error: "Incident not found" }, 404);
  const actor = await loadActor(c);
  if (!isOwner(incident, actor)) return c.json({ error: NOT_INVOLVED }, 403);

  const query = parseListQuery(c, {
    sortable: ["createdAt"],
    defaultSort: "createdAt",
    defaultDir: "asc",
    defaultPageSize: 50,
  });

  const countRow = await db
    .select({ total: sql<number>`count(*)` })
    .from(incidentComments)
    .where(eq(incidentComments.incidentId, id))
    .get();
  const total = Number(countRow?.total ?? 0);
  const pagedQuery = clampListQuery(query, total);
  const rows = await db
    .select({
        id: incidentComments.id,
        body: incidentComments.body,
        authorId: incidentComments.authorId,
        authorName: incidentComments.authorName,
        createdAt: incidentComments.createdAt,
        authorRole: users.role,
    })
    .from(incidentComments)
    .leftJoin(users, eq(incidentComments.authorId, users.id))
    .where(eq(incidentComments.incidentId, id))
    .orderBy(query.dir === "desc" ? desc(incidentComments.createdAt) : asc(incidentComments.createdAt))
    .limit(query.pageSize)
    .offset(pagedQuery.offset)
    .all();

  return c.json({ data: rows, meta: listMeta(pagedQuery, total) });
});

collabRoutes.post("/:id/comments", async (c) => {
  const id = Number(c.req.param("id"));
  const actor = await loadActor(c);
  const incident = await loadIncident(id);
  if (!incident) return c.json({ error: "Incident not found" }, 404);
  if (!isOwner(incident, actor)) return c.json({ error: NOT_INVOLVED }, 403);

  const body = await c.req.json().catch(() => ({}));
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  if (!(await consumeRateLimit("comment", RATE_RULES.comment, { subject: `user:${actor.id}` }))) {
    return c.json({ error: retryAfterMessage(RATE_RULES.comment) }, 429);
  }

  const row = await db
    .insert(incidentComments)
    .values({
      incidentId: id,
      authorId: actor.id,
      authorName: actor.name,
      body: parsed.data.body,
    })
    .returning()
    .get();

  await logEvent({
    incidentId: id,
    type: "comment",
    message: `${actor.name} commented`,
    actorId: actor.id,
    actorName: actor.name,
  });

  const targets = await watcherIds(incident, actor.id);
  if (targets.length) {
    await notify(
      targets.map((userId) => ({
        userId,
        type: "comment",
        title: `New comment from ${actor.name}`,
        body: parsed.data.body.slice(0, 140),
        link: `/incidents/${id}`,
      })),
    );
  }
  if (actor.role !== "admin") {
    await notifyAdmins(
      {
        type: "comment",
        title: `New comment on "${incident.title}"`,
        body: `${actor.name}: ${parsed.data.body.slice(0, 120)}`,
        link: `/incidents/${id}`,
      },
      actor.id,
    );
  }

  return c.json({ comment: row }, 201);
});

collabRoutes.delete("/:id/comments/:commentId", async (c) => {
  const id = Number(c.req.param("id"));
  const commentId = Number(c.req.param("commentId"));
  const actor = await loadActor(c);

  const row = await db
    .select()
    .from(incidentComments)
    .where(and(eq(incidentComments.id, commentId), eq(incidentComments.incidentId, id)))
    .get();
  if (!row) return c.json({ error: "Comment not found" }, 404);
  if (actor.role !== "admin" && row.authorId !== actor.id) {
    return c.json({ error: "You can only delete your own comment" }, 403);
  }

  await db.delete(incidentComments).where(eq(incidentComments.id, commentId));
  await logAudit(c, {
    action: "delete",
    entity: "comment",
    entityId: commentId,
    detail: `incident ${id}`,
  });
  return c.json({ ok: true });
});

collabRoutes.get("/:id/events", async (c) => {
  const id = Number(c.req.param("id"));
  const incident = await loadIncident(id);
  if (!incident) return c.json({ error: "Incident not found" }, 404);
  const actor = await loadActor(c);
  if (!isOwner(incident, actor)) return c.json({ error: NOT_INVOLVED }, 403);

  const rows = await db
    .select({
      id: incidentEvents.id,
      type: incidentEvents.type,
      message: incidentEvents.message,
      actorId: incidentEvents.actorId,
      actorName: incidentEvents.actorName,
      fromValue: incidentEvents.fromValue,
      toValue: incidentEvents.toValue,
      createdAt: incidentEvents.createdAt,
    })
    .from(incidentEvents)
    .where(eq(incidentEvents.incidentId, id))
    .orderBy(desc(incidentEvents.createdAt), desc(incidentEvents.id))
    .limit(100)
    .all();

  return c.json({ data: rows });
});

collabRoutes.get("/:id/tasks", async (c) => {
  const id = Number(c.req.param("id"));
  const incident = await loadIncident(id);
  if (!incident) return c.json({ error: "Incident not found" }, 404);
  const actor = await loadActor(c);
  if (!isOwner(incident, actor)) return c.json({ error: NOT_INVOLVED }, 403);

  const rows = await db
    .select({
      id: incidentTasks.id,
      title: incidentTasks.title,
      done: incidentTasks.done,
      doneAt: incidentTasks.doneAt,
      createdAt: incidentTasks.createdAt,
      doneBy: incidentTasks.doneBy,
      doneByName: users.name,
    })
    .from(incidentTasks)
    .leftJoin(users, eq(incidentTasks.doneBy, users.id))
    .where(eq(incidentTasks.incidentId, id))
    .orderBy(asc(incidentTasks.id))
    .all();

  const done = rows.filter((row) => row.done).length;
  return c.json({
    data: rows,
    progress: { done, total: rows.length, percent: rows.length ? Math.round((done / rows.length) * 100) : 0 },
  });
});

collabRoutes.post("/:id/tasks", async (c) => {
  const id = Number(c.req.param("id"));
  const actor = await loadActor(c);
  const incident = await loadIncident(id);
  if (!incident) return c.json({ error: "Incident not found" }, 404);
  if (!isOwner(incident, actor)) {
    return c.json({ error: NOT_INVOLVED }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const existing = await db
    .select({ total: sql<number>`count(*)` })
    .from(incidentTasks)
    .where(eq(incidentTasks.incidentId, id))
    .get();
  if (Number(existing?.total ?? 0) >= 40) {
    return c.json({ error: "This checklist is full (40 items max)" }, 409);
  }

  const row = await db
    .insert(incidentTasks)
    .values({ incidentId: id, title: parsed.data.title, createdBy: actor.id })
    .returning()
    .get();

  await logEvent({
    incidentId: id,
    type: "task",
    message: `${actor.name} added step "${parsed.data.title}"`,
    actorId: actor.id,
    actorName: actor.name,
  });
  return c.json({ task: row }, 201);
});

collabRoutes.patch("/:id/tasks/:taskId", async (c) => {
  const id = Number(c.req.param("id"));
  const taskId = Number(c.req.param("taskId"));
  const actor = await loadActor(c);
  const incident = await loadIncident(id);
  if (!incident) return c.json({ error: "Incident not found" }, 404);
  if (!isOwner(incident, actor)) {
    return c.json({ error: NOT_INVOLVED }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const existing = await db
    .select()
    .from(incidentTasks)
    .where(and(eq(incidentTasks.id, taskId), eq(incidentTasks.incidentId, id)))
    .get();
  if (!existing) return c.json({ error: "Checklist item not found" }, 404);

  const row = await db
    .update(incidentTasks)
    .set({
      done: parsed.data.done,
      doneAt: parsed.data.done ? sqlNow() : null,
      doneBy: parsed.data.done ? actor.id : null,
    })
    .where(eq(incidentTasks.id, taskId))
    .returning()
    .get();

  if (existing.done !== parsed.data.done) {
    await logEvent({
      incidentId: id,
      type: "task",
      message: `${actor.name} ${parsed.data.done ? "completed" : "reopened"} "${existing.title}"`,
      actorId: actor.id,
      actorName: actor.name,
      toValue: parsed.data.done ? "done" : "open",
    });
  }

  return c.json({ task: row });
});

collabRoutes.delete("/:id/tasks/:taskId", async (c) => {
  const id = Number(c.req.param("id"));
  const taskId = Number(c.req.param("taskId"));
  const actor = await loadActor(c);
  const incident = await loadIncident(id);
  if (!incident) return c.json({ error: "Incident not found" }, 404);
  if (!isOwner(incident, actor)) {
    return c.json({ error: NOT_INVOLVED }, 403);
  }

  const row = await db
    .delete(incidentTasks)
    .where(and(eq(incidentTasks.id, taskId), eq(incidentTasks.incidentId, id)))
    .returning()
    .get();
  if (!row) return c.json({ error: "Checklist item not found" }, 404);
  await logAudit(c, {
    action: "delete",
    entity: "task",
    entityId: taskId,
    detail: `incident ${id}`,
  });
  return c.json({ ok: true });
});
