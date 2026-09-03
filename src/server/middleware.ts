import type { Context, Next } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import {
  SESSION_COOKIE,
  clearCookieOptions,
  verifyToken,
  type SessionPayload,
} from "@/lib/auth";
import { sessionUsable, touchSession } from "./sessions";

export type Variables = { user: SessionPayload };
export type AppContext = Context<{ Variables: Variables }>;

export async function requireAuth(c: AppContext, next: Next) {
  if (c.get("user")) {
    await next();
    return;
  }

  const token = getCookie(c, SESSION_COOKIE);
  const session = await verifyToken(token);
  if (!session || !session.jti) {
    if (token) deleteCookie(c, SESSION_COOKIE, clearCookieOptions());
    return c.json({ error: "Unauthorized" }, 401);
  }

  const row = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      revokedAt: sessions.revokedAt,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      status: users.status,
      role: users.role,
      name: users.name,
      email: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, session.jti))
    .get();

  if (!row || row.userId !== Number(session.sub) || !sessionUsable(row)) {
    deleteCookie(c, SESSION_COOKIE, clearCookieOptions());
    return c.json({ error: "Session ended. Please sign in again." }, 401);
  }

  if (row.status === "banned") {
    return c.json({ error: "Account suspended" }, 403);
  }
  if (row.status === "pending") {
    return c.json({ error: "Account awaiting approval" }, 403);
  }

  await touchSession(row.sessionId, row.lastSeenAt);

  c.set("user", {
    sub: String(row.userId),
    name: row.name,
    email: row.email,
    role: row.role,
    jti: row.sessionId,
  });
  await next();
}

export async function requireAdmin(c: AppContext, next: Next) {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return c.json({ error: "Forbidden: admin only" }, 403);
  }
  await next();
}

export function currentUser(c: AppContext) {
  const user = c.get("user");
  return {
    id: Number(user.sub),
    name: user.name,
    email: user.email,
    role: user.role,
    sessionId: user.jti,
  };
}
