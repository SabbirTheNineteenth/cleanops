import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sites } from "@/db/schema";
import { siteSchema } from "@/lib/validation";
import { requireAuth, requireAdmin, type Variables } from "../middleware";

export const siteRoutes = new Hono<{ Variables: Variables }>();

siteRoutes.use("*", requireAuth);

siteRoutes.get("/", (c) => {
  const rows = db.select().from(sites).orderBy(desc(sites.createdAt)).all();
  return c.json({ sites: rows });
});

siteRoutes.get("/:id", (c) => {
  const id = Number(c.req.param("id"));
  const row = db.select().from(sites).where(eq(sites.id, id)).get();
  if (!row) return c.json({ error: "Site not found" }, 404);
  return c.json({ site: row });
});

siteRoutes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = siteSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const existing = db
    .select()
    .from(sites)
    .where(eq(sites.code, parsed.data.code))
    .get();
  if (existing) return c.json({ error: "Site code already exists" }, 409);

  const row = db.insert(sites).values(parsed.data).returning().get();
  return c.json({ site: row }, 201);
});

siteRoutes.patch("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const parsed = siteSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const row = db
    .update(sites)
    .set(parsed.data)
    .where(eq(sites.id, id))
    .returning()
    .get();
  if (!row) return c.json({ error: "Site not found" }, 404);
  return c.json({ site: row });
});

siteRoutes.delete("/:id", requireAdmin, (c) => {
  const id = Number(c.req.param("id"));
  const row = db.delete(sites).where(eq(sites.id, id)).returning().get();
  if (!row) return c.json({ error: "Site not found" }, 404);
  return c.json({ ok: true });
});
