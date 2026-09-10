import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { MAX_AGE_SECONDS } from "@/lib/auth";
import { addMinutes, minutesAgo, parseTime, sqlNow, toSqlTime } from "@/lib/time";

const TOUCH_AFTER_MINUTES = 5;
const DEFAULT_RETENTION_BATCH = 100;
const MAX_RETENTION_BATCH = 500;

export function sessionRetentionBatch(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RETENTION_BATCH;
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_RETENTION_BATCH);
}

function newSessionId(): string {
  return randomBytes(24).toString("base64url");
}

export async function startSession(
  userId: number,
  meta: { ip?: string; userAgent?: string },
): Promise<string> {
  const id = newSessionId();
  await db.insert(sessions).values({
    id,
    userId,
    ip: (meta.ip ?? "").slice(0, 64),
    userAgent: (meta.userAgent ?? "").slice(0, 200),
    expiresAt: toSqlTime(addMinutes(new Date(), MAX_AGE_SECONDS / 60)),
  });
  return id;
}

export async function loadSession(id: string) {
  if (!id) return null;
  return db.select().from(sessions).where(eq(sessions.id, id)).get();
}

export function sessionUsable(row: {
  revokedAt: string | null;
  expiresAt: string;
}): boolean {
  if (row.revokedAt) return false;
  const expires = parseTime(row.expiresAt);
  return Boolean(expires && expires.getTime() > Date.now());
}

export async function touchSession(id: string, lastSeenAt: string): Promise<void> {
  const seen = parseTime(lastSeenAt);
  if (seen && seen.getTime() > Date.now() - TOUCH_AFTER_MINUTES * 60_000) return;
  try {
    await db.update(sessions).set({ lastSeenAt: sqlNow() }).where(eq(sessions.id, id));
  } catch (err) {
    console.error("[session] touch failed:", err);
  }
}

export async function revokeSession(id: string, userId: number): Promise<boolean> {
  const row = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .get();
  if (!row) return false;
  await db.update(sessions).set({ revokedAt: sqlNow() }).where(eq(sessions.id, id));
  return true;
}

export async function revokeOtherSessions(
  userId: number,
  keepId?: string | null,
): Promise<number> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (keepId) conditions.push(ne(sessions.id, keepId));
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(...conditions))
    .all();
  if (rows.length === 0) return 0;
  await db.update(sessions).set({ revokedAt: sqlNow() }).where(and(...conditions));
  return rows.length;
}

export async function listSessions(userId: number) {
  return db
    .select({
      id: sessions.id,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastSeenAt))
    .limit(25)
    .all();
}

export async function pruneSessions(limit = 100): Promise<number> {
  try {
    const expired = await db.select({ id: sessions.id }).from(sessions)
      .where(sql`expires_at < ${minutesAgo(0)}`)
      .orderBy(sessions.expiresAt).limit(Math.min(Math.max(limit, 1), 500)).all();
    if (!expired.length) return 0;
    await db.delete(sessions).where(sql`${sessions.id} in (${sql.join(expired.map((row) => sql`${row.id}`), sql`, `)})`);
    return expired.length;
  } catch (err) {
    console.error("[session] prune failed:", err);
    return 0;
  }
}

export function describeAgent(userAgent: string): string {
  const ua = userAgent || "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Firefox\//.test(ua)
            ? "Firefox"
            : "Unknown browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} · ${os}`;
}
