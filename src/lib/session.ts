import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { sessionUsable } from "@/server/sessions";
import { SESSION_COOKIE, verifyToken, type SessionPayload } from "./auth";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return verifyToken(token);
}

export async function getLiveSession(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session?.jti) return null;

  try {
    const row = await db
      .select({
        sessionId: sessions.id,
        userId: sessions.userId,
        revokedAt: sessions.revokedAt,
        expiresAt: sessions.expiresAt,
        status: users.status,
        role: users.role,
        name: users.name,
        email: users.email,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, session.jti))
      .get();

    if (!row || row.userId !== Number(session.sub) || !sessionUsable(row)) return null;
    if (row.status !== "active") return null;

    return {
      sub: String(row.userId),
      name: row.name,
      email: row.email,
      role: row.role,
      jti: row.sessionId,
    };
  } catch (err) {
    console.error("[session] live check failed:", err);
    return null;
  }
}
