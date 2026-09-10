import { Hono } from "hono";
import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { sqlNow } from "@/lib/time";
import { clampListQuery, listMeta, parseListQuery, searchPattern } from "../query";
import { requireAuth, type Variables } from "../middleware";

export const notificationRoutes = new Hono<{ Variables: Variables }>();

notificationRoutes.use("*", requireAuth);

const markSchema = z.object({
  ids: z.array(z.number().int().positive()).max(200).optional(),
});

function ownerId(c: { get: (key: "user") => { sub: string } }): number {
  return Number(c.get("user").sub);
}

notificationRoutes.get("/", async (c) => {
  const userId = ownerId(c);
  const query = parseListQuery(c, {
    sortable: ["createdAt"],
    defaultSort: "createdAt",
    defaultPageSize: 20,
  });
  const raw = c.req.query();

  const conditions = [eq(notifications.userId, userId)];
  if (raw.unread === "1") conditions.push(isNull(notifications.readAt));
  if (raw.type) conditions.push(eq(notifications.type, raw.type.slice(0, 40)));
  if (query.q) {
    const pattern = searchPattern(query.q);
    conditions.push(or(like(notifications.title, pattern), like(notifications.body, pattern))!);
  }
  const where = and(...conditions);

  const [countRow, unreadRow] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(notifications).where(where).get(),
    db
      .select({ total: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .get(),
  ]);
  const total = Number(countRow?.total ?? 0);
  const pagedQuery = clampListQuery(query, total);
  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(query.pageSize)
    .offset(pagedQuery.offset)
    .all();

  return c.json({
    data: rows.map((row) => ({ ...row, read: Boolean(row.readAt) })),
    meta: listMeta(pagedQuery, total),
    unread: Number(unreadRow?.total ?? 0),
  });
});

notificationRoutes.get("/unread-count", async (c) => {
  const row = await db
    .select({ total: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, ownerId(c)), isNull(notifications.readAt)))
    .get();
  return c.json({ unread: Number(row?.total ?? 0) });
});

notificationRoutes.post("/read", async (c) => {
  const userId = ownerId(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = markSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const ids = parsed.data.ids ?? [];
  const conditions = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (ids.length) conditions.push(inArray(notifications.id, ids));

  const pending = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(...conditions))
    .all();
  if (pending.length === 0) return c.json({ ok: true, updated: 0 });

  await db.update(notifications).set({ readAt: sqlNow() }).where(and(...conditions));
  return c.json({ ok: true, updated: pending.length });
});

notificationRoutes.delete("/read", async (c) => {
  const userId = ownerId(c);
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is not null`))
    .all();
  if (rows.length === 0) return c.json({ ok: true, removed: 0 });
  await db
    .delete(notifications)
    .where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is not null`));
  return c.json({ ok: true, removed: rows.length });
});

notificationRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db
    .delete(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, ownerId(c))))
    .returning()
    .get();
  if (!row) return c.json({ error: "Notification not found" }, 404);
  return c.json({ ok: true });
});
