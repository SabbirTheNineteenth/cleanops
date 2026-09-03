import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, incidentEvents, notifications, users } from "@/db/schema";
import type { AppContext } from "./middleware";

export function clientIp(c: AppContext): string {
  const header =
    c.req.header("x-forwarded-for") ??
    c.req.header("x-real-ip") ??
    c.req.header("cf-connecting-ip") ??
    "";
  return header.split(",")[0]!.trim().slice(0, 64);
}

export function clientAgent(c: AppContext): string {
  return (c.req.header("user-agent") ?? "").slice(0, 200);
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: number | null;
  detail?: string;
  actorId?: number | null;
  actorEmail?: string;
}

export async function logAudit(c: AppContext, entry: AuditEntry): Promise<void> {
  try {
    const current = c.get("user") as { sub?: string; email?: string } | undefined;
    const actorId =
      entry.actorId !== undefined
        ? entry.actorId
        : current?.sub
          ? Number(current.sub)
          : null;
    await db.insert(auditLogs).values({
      actorId: actorId ?? null,
      actorEmail: entry.actorEmail ?? current?.email ?? "system",
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      detail: (entry.detail ?? "").slice(0, 500),
      ip: clientIp(c),
      userAgent: clientAgent(c),
    });
  } catch (err) {
    console.error("[audit] failed:", err);
  }
}

export interface NotifyEntry {
  userId: number;
  type?: string;
  title: string;
  body?: string;
  link?: string | null;
}

export async function notify(entries: NotifyEntry[]): Promise<void> {
  const rows = entries.filter((entry) => Number.isFinite(entry.userId) && entry.userId > 0);
  if (rows.length === 0) return;
  try {
    await db.insert(notifications).values(
      rows.map((entry) => ({
        userId: entry.userId,
        type: entry.type ?? "info",
        title: entry.title.slice(0, 160),
        body: (entry.body ?? "").slice(0, 500),
        link: entry.link ?? null,
      })),
    );
  } catch (err) {
    console.error("[notify] failed:", err);
  }
}

export async function notifyAdmins(
  entry: Omit<NotifyEntry, "userId">,
  exceptUserId?: number | null,
): Promise<void> {
  try {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active")))
      .all();
    const targets = admins
      .map((row) => row.id)
      .filter((id) => id !== (exceptUserId ?? -1));
    await notify(targets.map((userId) => ({ ...entry, userId })));
  } catch (err) {
    console.error("[notify-admins] failed:", err);
  }
}

export async function notifyUsers(
  ids: number[],
  entry: Omit<NotifyEntry, "userId">,
): Promise<void> {
  const unique = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (unique.length === 0) return;
  await notify(unique.map((userId) => ({ ...entry, userId })));
}

export interface EventEntry {
  incidentId: number;
  type: string;
  message: string;
  actorId?: number | null;
  actorName?: string;
  fromValue?: string | null;
  toValue?: string | null;
}

export async function logEvent(entry: EventEntry): Promise<void> {
  try {
    await db.insert(incidentEvents).values({
      incidentId: entry.incidentId,
      actorId: entry.actorId ?? null,
      actorName: entry.actorName ?? "System",
      type: entry.type,
      message: entry.message.slice(0, 400),
      fromValue: entry.fromValue ?? null,
      toValue: entry.toValue ?? null,
    });
  } catch (err) {
    console.error("[event] failed:", err);
  }
}

export async function adminIdsExcept(userId?: number | null): Promise<number[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      userId
        ? and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, userId))
        : and(eq(users.role, "admin"), eq(users.status, "active")),
    )
    .all();
  return rows.map((row) => row.id);
}

export async function userIdsFor(ids: number[]): Promise<number[]> {
  const clean = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (clean.length === 0) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.id, clean))
    .all();
  return rows.map((row) => row.id);
}
