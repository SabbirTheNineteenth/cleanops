import { Hono } from "hono";
import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { logAudit } from "../activity";
import { clampListQuery, listMeta, optionalId, parseListQuery, searchPattern } from "../query";
import { csvResponse, stamped, toCsv } from "../csv";
import { requireAuth, requireAdmin, type Variables } from "../middleware";

export const auditRoutes = new Hono<{ Variables: Variables }>();

auditRoutes.use("*", requireAuth);
auditRoutes.use("*", requireAdmin);

function conditionsFor(query: Record<string, string>, search: string) {
  const conditions = [];
  const actorId = optionalId(query.actorId);
  if (query.action) conditions.push(eq(auditLogs.action, query.action.slice(0, 40)));
  if (query.entity) conditions.push(eq(auditLogs.entity, query.entity.slice(0, 40)));
  if (actorId) conditions.push(eq(auditLogs.actorId, actorId));
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "")) {
    conditions.push(gte(auditLogs.createdAt, `${query.from} 00:00:00`));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "")) {
    conditions.push(lte(auditLogs.createdAt, `${query.to} 23:59:59`));
  }
  if (search) {
    const pattern = searchPattern(search);
    conditions.push(
      or(
        like(auditLogs.actorEmail, pattern),
        like(auditLogs.action, pattern),
        like(auditLogs.entity, pattern),
        like(auditLogs.detail, pattern),
        like(auditLogs.ip, pattern),
      )!,
    );
  }
  return conditions;
}

auditRoutes.get("/", async (c) => {
  const query = parseListQuery(c, {
    sortable: ["createdAt"],
    defaultSort: "createdAt",
    defaultPageSize: 25,
  });
  const conditions = conditionsFor(c.req.query(), query.q);
  const where = conditions.length ? and(...conditions) : undefined;

  const countRow = await db.select({ total: sql<number>`count(*)` }).from(auditLogs).where(where).get();
  const total = Number(countRow?.total ?? 0);
  const pagedQuery = clampListQuery(query, total);
  const rows = await db
    .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorEmail: auditLogs.actorEmail,
        actorName: users.name,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        detail: auditLogs.detail,
        ip: auditLogs.ip,
        userAgent: auditLogs.userAgent,
        createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.actorId, users.id))
    .where(where)
    .orderBy(query.dir === "asc" ? auditLogs.createdAt : desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(query.pageSize)
    .offset(pagedQuery.offset)
    .all();

  if (query.isExport) {
    const csv = toCsv(
      ["ID", "When", "Actor", "Email", "Action", "Entity", "Entity ID", "Detail", "IP"],
      rows.map((row) => [
        row.id,
        row.createdAt,
        row.actorName ?? "",
        row.actorEmail,
        row.action,
        row.entity,
        row.entityId ?? "",
        row.detail,
        row.ip,
      ]),
    );
    await logAudit(c, { action: "export", entity: "audit", detail: `${rows.length} rows` });
    return csvResponse(c, stamped("audit-log"), csv);
  }

  return c.json({ data: rows, meta: listMeta(pagedQuery, total) });
});

auditRoutes.get("/meta", async (c) => {
  const [actions, entities, actors] = await Promise.all([
    db.selectDistinct({ action: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action).all(),
    db.selectDistinct({ entity: auditLogs.entity }).from(auditLogs).orderBy(auditLogs.entity).all(),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .orderBy(users.name)
      .all(),
  ]);
  return c.json({
    actions: actions.map((row) => row.action).filter(Boolean),
    entities: entities.map((row) => row.entity).filter(Boolean),
    actors,
  });
});
