import { Hono } from "hono";
import { and, eq, gte, isNotNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidents, sites, workers, users } from "@/db/schema";
import {
  incidentSchema,
  incidentUpdateSchema,
  incidentWorkSchema,
  enhanceTextSchema,
} from "@/lib/validation";
import { computeDueAt, slaInfo } from "@/lib/sla";
import { parseTime, sqlNow } from "@/lib/time";
import { enhanceIncidentText } from "../ai";
import { logAudit, writeAudit, writeEvent, writeNotifications } from "../activity";
import { RATE_RULES, consumeRateLimit, retryAfterMessage } from "../ratelimit";
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
import { validateIncidentTransition } from "../workflow";
import { requestedIncidentStatus, toIncidentDueAt } from "../incident-helpers";
import { enqueueIncidentTriage } from "../triage";

export const incidentRoutes = new Hono<{ Variables: Variables }>();

incidentRoutes.use("*", requireAuth);

const SORTABLE = [
  "createdAt",
  "updatedAt",
  "severity",
  "status",
  "title",
  "dueAt",
  "siteName",
] as const;
const STATUSES = ["open", "assigned", "in_progress", "resolved"] as const;
const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const SLA_FILTERS = ["overdue", "due_soon", "breached", "met"] as const;

const severityRank = sql`case ${incidents.severity} when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end`;
const statusRank = sql`case ${incidents.status} when 'open' then 1 when 'assigned' then 2 when 'in_progress' then 3 else 4 end`;

const SORT_COLUMNS: Record<string, unknown> = {
  createdAt: incidents.createdAt,
  updatedAt: incidents.updatedAt,
  title: incidents.title,
  dueAt: incidents.dueAt,
  siteName: sites.name,
  severity: severityRank,
  status: statusRank,
};

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
      siteCode: sites.code,
      assignedTo: incidents.assignedTo,
      workerName: workers.name,
      workerRole: workers.role,
      reportedBy: incidents.reportedBy,
      reporterName: users.name,
      aiSummary: incidents.aiSummary,
      aiSeverity: incidents.aiSeverity,
      aiSuggestedAction: incidents.aiSuggestedAction,
      aiRecommendedRole: incidents.aiRecommendedRole,
      aiResponseWindow: incidents.aiResponseWindow,
      aiSource: incidents.aiSource,
      aiStatus: incidents.aiStatus,
      resolutionNote: incidents.resolutionNote,
      dueAt: incidents.dueAt,
      createdAt: incidents.createdAt,
      updatedAt: incidents.updatedAt,
      version: incidents.version,
      resolvedAt: incidents.resolvedAt,
    })
    .from(incidents)
    .leftJoin(sites, eq(incidents.siteId, sites.id))
    .leftJoin(workers, eq(incidents.assignedTo, workers.id))
    .leftJoin(users, eq(incidents.reportedBy, users.id));
}

type IncidentRow = Awaited<ReturnType<ReturnType<typeof withJoins>["get"]>>;

function decorate(row: NonNullable<IncidentRow>) {
  return { ...row, sla: slaInfo(row) };
}

function buildConditions(query: Record<string, string>, search: string) {
  const conditions = [];
  const status = pickEnum(query.status, STATUSES);
  const severity = pickEnum(query.severity, SEVERITIES);
  const sla = pickEnum(query.sla, SLA_FILTERS);
  const siteId = optionalId(query.siteId);
  const workerId = optionalId(query.workerId);
  const now = sqlNow();

  if (status) conditions.push(eq(incidents.status, status));
  if (severity) conditions.push(eq(incidents.severity, severity));
  if (siteId) conditions.push(eq(incidents.siteId, siteId));
  if (workerId) conditions.push(eq(incidents.assignedTo, workerId));
  if (query.category) conditions.push(eq(incidents.category, query.category.slice(0, 60)));
  if (query.unassigned === "1") conditions.push(sql`${incidents.assignedTo} is null`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "")) {
    conditions.push(gte(incidents.createdAt, `${query.from} 00:00:00`));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "")) {
    conditions.push(lte(incidents.createdAt, `${query.to} 23:59:59`));
  }

  if (sla === "overdue") {
    conditions.push(
      and(ne(incidents.status, "resolved"), isNotNull(incidents.dueAt), lt(incidents.dueAt, now))!,
    );
  }
  if (sla === "due_soon") {
    conditions.push(
      and(
        ne(incidents.status, "resolved"),
        isNotNull(incidents.dueAt),
        gte(incidents.dueAt, now),
        lte(incidents.dueAt, sql`datetime(${now}, '+2 hours')`),
      )!,
    );
  }
  if (sla === "breached") {
    conditions.push(
      and(
        eq(incidents.status, "resolved"),
        isNotNull(incidents.dueAt),
        sql`${incidents.resolvedAt} > ${incidents.dueAt}`,
      )!,
    );
  }
  if (sla === "met") {
    conditions.push(
      and(
        eq(incidents.status, "resolved"),
        isNotNull(incidents.dueAt),
        sql`${incidents.resolvedAt} <= ${incidents.dueAt}`,
      )!,
    );
  }

  if (search) {
    const pattern = searchPattern(search);
    conditions.push(
      or(
        like(incidents.title, pattern),
        like(incidents.description, pattern),
        like(incidents.category, pattern),
        like(sites.name, pattern),
        like(workers.name, pattern),
      )!,
    );
  }

  return conditions;
}

async function readAccessCondition(user: { sub: string; role: string }) {
  if (user.role === "admin") return undefined;
  const userId = Number(user.sub);
  const worker = await db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.userId, userId))
    .get();
  return worker
    ? or(eq(incidents.reportedBy, userId), eq(incidents.assignedTo, worker.id))
    : eq(incidents.reportedBy, userId);
}

async function countIncidents(conditions: ReturnType<typeof buildConditions>) {
  const row = await db
    .select({ total: sql<number>`count(*)` })
    .from(incidents)
    .leftJoin(sites, eq(incidents.siteId, sites.id))
    .leftJoin(workers, eq(incidents.assignedTo, workers.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .get();
  return Number(row?.total ?? 0);
}

incidentRoutes.get("/", async (c) => {
  const user = c.get("user");
  const query = parseListQuery(c, { sortable: SORTABLE, defaultSort: "createdAt" });
  const raw = c.req.query();
  const conditions = buildConditions(raw, query.q);
  const access = await readAccessCondition(user);
  if (access) conditions.push(access);
  const where = conditions.length ? and(...conditions) : undefined;
  const column = (SORT_COLUMNS[query.sort] ?? incidents.createdAt) as never;

  const total = await countIncidents(conditions);
  const pagedQuery = clampListQuery(query, total);
  const rows = await withJoins()
    .where(where)
    .orderBy(orderFor(column, query.dir))
    .limit(query.pageSize)
    .offset(pagedQuery.offset)
    .all();

  const data = rows.map(decorate);

  if (query.isExport) {
    const csv = toCsv(
      ["ID", "Title", "Site", "Category", "Status", "Severity", "Assignee", "Reporter", "Due", "SLA", "Created", "Resolved"],
      data.map((row) => [
        row.id,
        row.title,
        row.siteName ?? "",
        row.category,
        row.status,
        row.severity,
        row.workerName ?? "Unassigned",
        row.reporterName ?? "",
        row.dueAt ?? "",
        row.sla.label,
        row.createdAt,
        row.resolvedAt ?? "",
      ]),
    );
    await logAudit(c, { action: "export", entity: "incident", detail: `${data.length} rows` });
    return csvResponse(c, stamped("incidents"), csv);
  }

  return c.json({ data, meta: listMeta(pagedQuery, total) });
});

incidentRoutes.get("/mine", async (c) => {
  const user = c.get("user");
  const worker = await db
    .select()
    .from(workers)
    .where(eq(workers.userId, Number(user.sub)))
    .get();
  if (!worker) return c.json({ data: [], worker: null });

  const rows = await withJoins()
    .where(eq(incidents.assignedTo, worker.id))
    .orderBy(orderFor(severityRank, "desc"))
    .limit(50)
    .all();

  return c.json({
    data: rows.map(decorate),
    worker: { id: worker.id, name: worker.name, role: worker.role },
  });
});

incidentRoutes.get("/meta", async (c) => {
  const [categories, siteRows, workerRows] = await Promise.all([
    db
      .selectDistinct({ category: incidents.category })
      .from(incidents)
      .orderBy(incidents.category)
      .all(),
    db
      .select({ id: sites.id, name: sites.name, code: sites.code })
      .from(sites)
      .orderBy(sites.name)
      .all(),
    db
      .select({ id: workers.id, name: workers.name, role: workers.role })
      .from(workers)
      .orderBy(workers.name)
      .all(),
  ]);

  return c.json({
    categories: categories.map((row) => row.category).filter(Boolean),
    sites: siteRows,
    workers: workerRows,
  });
});

incidentRoutes.post("/enhance", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = enhanceTextSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  if (!(await consumeRateLimit("ai", RATE_RULES.ai, { subject: `user:${user.sub}` }))) {
    return c.json({ error: retryAfterMessage(RATE_RULES.ai) }, 429);
  }

  const result = await enhanceIncidentText(parsed.data);
  return c.json(result);
});

incidentRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "Incident not found" }, 404);
  const row = await withJoins().where(eq(incidents.id, id)).get();
  if (!row) return c.json({ error: "Incident not found" }, 404);
  const user = c.get("user");
  if (user.role !== "admin" && row.reportedBy !== Number(user.sub)) {
    const worker = await db.select({ id: workers.id }).from(workers)
      .where(eq(workers.userId, Number(user.sub))).get();
    if (!worker || row.assignedTo !== worker.id) return c.json({ error: "Forbidden" }, 403);
  }
  return c.json({ incident: decorate(row) });
});

incidentRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = incidentSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { title, description, category, siteId, severity } = parsed.data;

  const site = await db.select().from(sites).where(eq(sites.id, siteId)).get();
  if (!site) return c.json({ error: "Site not found" }, 404);

  const finalSeverity = severity ?? "medium";
  const admins = (finalSeverity === "critical" || finalSeverity === "high")
    ? await db.select({ id: users.id }).from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active"))).all()
    : [];
  const row = await db.transaction(async (tx) => {
    const created = await tx.insert(incidents).values({
      title, description, category, siteId, reportedBy: Number(user.sub), severity: finalSeverity,
      aiStatus: "pending", dueAt: computeDueAt(finalSeverity),
    }).returning().get();
    await writeEvent({
      incidentId: created.id, type: "created", message: `Reported at ${site.name}`,
      actorId: Number(user.sub), actorName: user.name, toValue: finalSeverity,
    }, tx);
    await writeAudit(c, {
      action: "create", entity: "incident", entityId: created.id, detail: `${title} (${finalSeverity})`,
    }, tx);
    await writeNotifications(admins.filter((admin) => admin.id !== Number(user.sub)).map((admin) => ({
      userId: admin.id,
      type: finalSeverity === "critical" ? "critical" : "warning",
      title: `${finalSeverity === "critical" ? "Critical" : "High"} incident at ${site.name}`,
      body: title,
      link: `/incidents/${created.id}`,
    })), tx);
    await enqueueIncidentTriage(created.id, tx);
    return created;
  });
  return c.json({ incident: row, ai: null, triageStatus: "pending" }, 201);
});

incidentRoutes.post("/:id/analyze", requireAdmin, async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const row = await db.select().from(incidents).where(eq(incidents.id, id)).get();
  if (!row) return c.json({ error: "Incident not found" }, 404);
  if (!(await consumeRateLimit("ai", RATE_RULES.ai, { subject: `user:${user.sub}` }))) {
    return c.json({ error: retryAfterMessage(RATE_RULES.ai) }, 429);
  }
  const updated = await db.transaction(async (tx) => {
    const pending = await tx.update(incidents).set({ aiStatus: "pending", updatedAt: sqlNow() })
      .where(eq(incidents.id, id)).returning().get();
    await writeEvent({
      incidentId: id, type: "ai", message: "AI re-analysis queued",
      actorId: Number(user.sub), actorName: user.name,
    }, tx);
    await writeAudit(c, { action: "analyze", entity: "incident", entityId: id, detail: "queued" }, tx);
    await enqueueIncidentTriage(id, tx);
    return pending;
  });
  return c.json({ incident: updated, ai: null, triageStatus: "pending" }, 202);
});

incidentRoutes.patch("/:id", requireAdmin, async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const existing = await db.select().from(incidents).where(eq(incidents.id, id)).get();
  if (!existing) return c.json({ error: "Incident not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  const parsed = incidentUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { version, status, severity, assignedTo, resolutionNote, dueAt } = parsed.data;
  const nextAssignedTo = assignedTo === undefined ? existing.assignedTo : assignedTo;
  const nextResolutionNote = resolutionNote === undefined ? existing.resolutionNote : resolutionNote;
  const requestedStatus = requestedIncidentStatus(status, assignedTo, existing.status);
  if (requestedStatus) {
    const transition = validateIncidentTransition(existing.status, requestedStatus, {
      assignedTo: nextAssignedTo,
      resolutionNote: nextResolutionNote,
    });
    if (!transition.ok) return c.json({ error: transition.error }, 409);
  }
  if (assignedTo === null && existing.status !== "open") {
    return c.json({ error: "Assigned or active incidents cannot be unassigned" }, 409);
  }

  const patch: Record<string, unknown> = {
    updatedAt: sqlNow(),
    version: sql`${incidents.version} + 1`,
  };
  const events: Parameters<typeof writeEvent>[0][] = [];
  const notices: Parameters<typeof writeNotifications>[0] = [];
  let assignedUserId: number | null = null;

  if (assignedTo !== undefined) {
    if (assignedTo !== null) {
      const worker = await db.select().from(workers).where(eq(workers.id, assignedTo)).get();
      if (!worker) return c.json({ error: "Worker not found" }, 404);
      patch.assignedTo = assignedTo;
      if (existing.status === "open") patch.status = "assigned";
      assignedUserId = worker.userId ?? null;
      if (existing.assignedTo !== assignedTo) {
        events.push({
          incidentId: id,
          type: "assigned",
          message: `Assigned to ${worker.name}`,
          actorId: Number(user.sub),
          actorName: user.name,
          toValue: worker.name,
        });
        if (assignedUserId) {
          notices.push({
            userId: assignedUserId,
            type: "assignment",
            title: "New incident assigned to you",
            body: existing.title,
            link: `/incidents/${id}`,
          });
        }
      }
    } else {
      patch.assignedTo = null;
      if (existing.assignedTo) {
        events.push({
          incidentId: id,
          type: "assigned",
          message: "Assignment cleared",
          actorId: Number(user.sub),
          actorName: user.name,
        });
      }
    }
  }

  if (severity && severity !== existing.severity) {
    patch.severity = severity;
    if (existing.status !== "resolved") {
      patch.dueAt = computeDueAt(
        severity,
        existing.aiResponseWindow,
        parseTime(existing.createdAt) ?? new Date(),
      );
    }
    events.push({
      incidentId: id,
      type: "severity",
      message: `Severity ${existing.severity} → ${severity}`,
      actorId: Number(user.sub),
      actorName: user.name,
      fromValue: existing.severity,
      toValue: severity,
    });
  }

  if (resolutionNote !== undefined && resolutionNote !== existing.resolutionNote) {
    patch.resolutionNote = resolutionNote;
  }

  if (dueAt !== undefined) {
    const nextDue = toIncidentDueAt(dueAt);
    if (nextDue === undefined) return c.json({ error: "Due date is not a valid date" }, 400);
    patch.dueAt = nextDue;
    if (nextDue !== (existing.dueAt ?? null)) {
      events.push({
        incidentId: id,
        type: "due",
        message: nextDue ? `Response deadline set to ${nextDue} UTC` : "Response deadline cleared",
        actorId: Number(user.sub),
        actorName: user.name,
        fromValue: existing.dueAt ?? null,
        toValue: nextDue,
      });
    }
  }

  if (requestedStatus && requestedStatus !== existing.status) {
    patch.status = requestedStatus;
    patch.resolvedAt = requestedStatus === "resolved" ? sqlNow() : null;
    events.push({
      incidentId: id,
      type: "status",
      message: `Status ${existing.status} → ${requestedStatus}`,
      actorId: Number(user.sub),
      actorName: user.name,
      fromValue: existing.status,
      toValue: requestedStatus,
    });
    if (requestedStatus === "resolved" && existing.reportedBy !== Number(user.sub)) {
      notices.push({
        userId: existing.reportedBy,
        type: "resolved",
        title: "Your incident was resolved",
        body: existing.title,
        link: `/incidents/${id}`,
      });
    }
  }

  const updated = await db.transaction(async (tx) => {
    const changed = await tx.update(incidents).set(patch)
      .where(and(eq(incidents.id, id), eq(incidents.version, version))).returning().get();
    if (!changed) return null;
    for (const event of events) await writeEvent(event, tx);
    await writeNotifications(notices, tx);
    await writeAudit(c, {
      action: "update",
      entity: "incident",
      entityId: id,
      detail: Object.keys(patch)
        .filter((key) => key !== "updatedAt")
        .join(", "),
    }, tx);
    return changed;
  });

  if (!updated) return c.json({ error: "Incident changed. Refresh and try again." }, 409);
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
  const { version, status, resolutionNote } = parsed.data;

  if (status) {
    const transition = validateIncidentTransition(existing.status, status, {
      assignedTo: existing.assignedTo,
      resolutionNote: resolutionNote === undefined ? existing.resolutionNote : resolutionNote,
    });
    if (!transition.ok) return c.json({ error: transition.error }, 409);
  }

  const patch: Record<string, unknown> = {
    updatedAt: sqlNow(),
    version: sql`${incidents.version} + 1`,
  };
  if (resolutionNote !== undefined) patch.resolutionNote = resolutionNote;
  if (status) {
    patch.status = status;
    patch.resolvedAt = status === "resolved" ? sqlNow() : null;
  }

  const events: Parameters<typeof writeEvent>[0][] = [];
  const notices: Parameters<typeof writeNotifications>[0] = [];
  if (status && status !== existing.status) {
    events.push({
      incidentId: id,
      type: "status",
      message: `${worker.name} moved this to ${status.replace("_", " ")}`,
      actorId: Number(user.sub),
      actorName: user.name,
      fromValue: existing.status,
      toValue: status,
    });
    const admins = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active"))).all();
    notices.push(...admins.filter((admin) => admin.id !== Number(user.sub)).map((admin) => ({
      userId: admin.id,
      type: status === "resolved" ? "resolved" : "info",
      title: status === "resolved" ? `${worker.name} resolved an incident` : `${worker.name} started work on an incident`,
      body: existing.title,
      link: `/incidents/${id}`,
    })));
  } else if (resolutionNote !== undefined) {
    events.push({
      incidentId: id,
      type: "note",
      message: `${worker.name} updated the work note`,
      actorId: Number(user.sub),
      actorName: user.name,
    });
  }
  const updated = await db.transaction(async (tx) => {
    const changed = await tx.update(incidents).set(patch)
      .where(and(eq(incidents.id, id), eq(incidents.version, version))).returning().get();
    if (!changed) return null;
    for (const event of events) await writeEvent(event, tx);
    await writeNotifications(notices, tx);
    await writeAudit(c, {
      action: "work_update",
      entity: "incident",
      entityId: id,
      detail: status ?? "note",
    }, tx);
    return changed;
  });

  if (!updated) return c.json({ error: "Incident changed. Refresh and try again." }, 409);
  return c.json({ incident: updated });
});

incidentRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.transaction(async (tx) => {
    const deleted = await tx.delete(incidents).where(eq(incidents.id, id)).returning().get();
    if (!deleted) return null;
    await writeAudit(c, {
      action: "delete", entity: "incident", entityId: id, detail: deleted.title,
    }, tx);
    return deleted;
  });
  if (!row) return c.json({ error: "Incident not found" }, 404);
  return c.json({ ok: true });
});
