import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, workers } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { adminCreateUserSchema } from "@/lib/validation";
import { requireAuth, requireAdmin, type Variables } from "../middleware";

export const userRoutes = new Hono<{ Variables: Variables }>();

userRoutes.use("*", requireAuth);

const userStatusSchema = z.object({
  status: z.enum(["active", "banned"]),
});

const publicUserCols = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
};

function ensureWorkerForUser(u: { id: number; name: string; email: string; role: string }) {
  if (u.role !== "user") return;
  const existing = db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.userId, u.id))
    .get();
  if (existing) return;
  const emailTaken = db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.email, u.email.toLowerCase()))
    .get();
  if (emailTaken) {

    db.update(workers).set({ userId: u.id }).where(eq(workers.id, emailTaken.id)).run();
    return;
  }
  db.insert(workers)
    .values({
      userId: u.id,
      name: u.name,
      email: u.email.toLowerCase(),
      role: "Field Technician",
      status: "available",
    })
    .run();
}

userRoutes.get("/", requireAdmin, (c) => {
  const rows = db
    .select(publicUserCols)
    .from(users)
    .orderBy(desc(users.createdAt))
    .all();
  return c.json({ users: rows });
});

userRoutes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = adminCreateUserSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { name, email, password, role } = parsed.data;

  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .get();
  if (existing) return c.json({ error: "Email already registered" }, 409);

  const passwordHash = await hashPassword(password);
  const row = db
    .insert(users)
    .values({ name, email: email.toLowerCase(), passwordHash, role, status: "active" })
    .returning(publicUserCols)
    .get();
  ensureWorkerForUser(row);
  return c.json({ user: row }, 201);
});

userRoutes.patch("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const me = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = userStatusSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  if (Number(me.sub) === id) {
    return c.json({ error: "You cannot change your own account status" }, 400);
  }

  const target = db.select().from(users).where(eq(users.id, id)).get();
  if (!target) return c.json({ error: "User not found" }, 404);
  if (target.role === "admin" && parsed.data.status === "banned") {
    return c.json({ error: "Admin accounts cannot be banned" }, 400);
  }

  const row = db
    .update(users)
    .set({ status: parsed.data.status })
    .where(eq(users.id, id))
    .returning(publicUserCols)
    .get();

  if (parsed.data.status === "active") ensureWorkerForUser(row);

  return c.json({ user: row });
});

userRoutes.delete("/:id", requireAdmin, (c) => {
  const id = Number(c.req.param("id"));
  const me = c.get("user");
  if (Number(me.sub) === id) {
    return c.json({ error: "You cannot delete your own account" }, 400);
  }
  const target = db.select().from(users).where(eq(users.id, id)).get();
  if (!target) return c.json({ error: "User not found" }, 404);
  if (target.role === "admin") {
    return c.json({ error: "Admin accounts cannot be deleted" }, 400);
  }
  db.delete(users).where(eq(users.id, id)).run();
  return c.json({ ok: true });
});
