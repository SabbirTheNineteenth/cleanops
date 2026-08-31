import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SESSION_COOKIE, verifyToken, type SessionPayload } from "@/lib/auth";

export type Variables = { user: SessionPayload };
export type AppContext = Context<{ Variables: Variables }>;

export async function requireAuth(c: AppContext, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  const session = await verifyToken(token);
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const account = await db
    .select({ status: users.status, role: users.role })
    .from(users)
    .where(eq(users.id, Number(session.sub)))
    .get();
  if (!account) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (account.status === "banned") {
    return c.json({ error: "Account suspended" }, 403);
  }
  if (account.status === "pending") {
    return c.json({ error: "Account awaiting approval" }, 403);
  }

  c.set("user", { ...session, role: account.role });
  await next();
}

export async function requireAdmin(c: AppContext, next: Next) {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return c.json({ error: "Forbidden: admin only" }, 403);
  }
  await next();
}
