import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { workers } from "@/db/schema";
import { workerSchema } from "@/lib/validation";
import { requireAuth, requireAdmin, type Variables } from "../middleware";

export const workerRoutes = new Hono<{ Variables: Variables }>();

workerRoutes.use("*", requireAuth);

workerRoutes.get("/", async (c) => {
  const rows = await db.select().from(workers).orderBy(desc(workers.createdAt)).all();
  return c.json({ workers: rows });
});

workerRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.select().from(workers).where(eq(workers.id, id)).get();
  if (!row) return c.json({ error: "Worker not found" }, 404);
  return c.json({ worker: row });
});

workerRoutes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = workerSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const existing = await db
    .select()
    .from(workers)
    .where(eq(workers.email, parsed.data.email.toLowerCase()))
    .get();
  if (existing) return c.json({ error: "Worker email already exists" }, 409);

  const row = await db
    .insert(workers)
    .values({ ...parsed.data, email: parsed.data.email.toLowerCase() })
    .returning()
    .get();
  return c.json({ worker: row }, 201);
});

workerRoutes.patch("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const parsed = workerSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const row = await db
    .update(workers)
    .set(parsed.data)
    .where(eq(workers.id, id))
    .returning()
    .get();
  if (!row) return c.json({ error: "Worker not found" }, 404);
  return c.json({ worker: row });
});

workerRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const row = await db.delete(workers).where(eq(workers.id, id)).returning().get();
  if (!row) return c.json({ error: "Worker not found" }, 404);
  return c.json({ ok: true });
});
