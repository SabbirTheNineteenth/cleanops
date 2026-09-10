import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, incidentEvents, notifications, users } from "@/db/schema";
import type { AppContext } from "./middleware";
import { logBestEffortFailure } from "./logging";

type WriteExecutor = Pick<typeof db, "insert">;

export function clientIp(c: AppContext): string {
  const socketAddress = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming?.socket?.remoteAddress;
  if (socketAddress) return socketAddress.slice(0, 64);

  const trustsForwardedHeaders = process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "true";
  if (!trustsForwardedHeaders) return "";

  const header = c.req.header("x-forwarded-for") ?? c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "";
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

export async function writeAudit(c: AppContext, entry: AuditEntry, executor: WriteExecutor = db): Promise<void> {
  const current = c.get("user") as { sub?: string; email?: string } | undefined;
  const actorId = entry.actorId !== undefined ? entry.actorId : current?.sub ? Number(current.sub) : null;
  await executor.insert(auditLogs).values({
    actorId: actorId ?? null,
    actorEmail: entry.actorEmail ?? current?.email ?? "system",
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    detail: (entry.detail ?? "").slice(0, 500),
    ip: clientIp(c),
    userAgent: clientAgent(c),
  });
}

export async function logAudit(c: AppContext, entry: AuditEntry): Promise<void> {
  try {
    await writeAudit(c, entry);
  } catch (err) {
    logBestEffortFailure("audit.write", err, {
      action: entry.action,
      entity: entry.entity,
      requestId: c.get("requestId"),
    });
  }
}

export interface NotifyEntry {
  userId: number;
  type?: string;
  title: string;
  body?: string;
  link?: string | null;
}

export async function writeNotifications(entries: NotifyEntry[], executor: WriteExecutor = db): Promise<void> {
  const rows = entries.filter((entry) => Number.isFinite(entry.userId) && entry.userId > 0);
  if (!rows.length) return;
  await executor.insert(notifications).values(rows.map((entry) => ({
    userId: entry.userId,
    type: entry.type ?? "info",
    title: entry.title.slice(0, 160),
    body: (entry.body ?? "").slice(0, 500),
    link: entry.link ?? null,
  })));
}

export async function notify(entries: NotifyEntry[]): Promise<void> {
  try {
    await writeNotifications(entries);
  } catch (err) {
    logBestEffortFailure("notification.write", err, { recipients: entries.length });
  }
}

export async function notifyAdmins(
  entry: Omit<NotifyEntry, "userId">,
  exceptUserId?: number | null,
): Promise<void> {
  try {
    const admins = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active"))).all();
    await notify(admins.map((row) => row.id).filter((id) => id !== (exceptUserId ?? -1))
      .map((userId) => ({ ...entry, userId })));
  } catch (err) {
    logBestEffortFailure("notification.admin_lookup", err, { recipients: 0 });
  }
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

export async function writeEvent(entry: EventEntry, executor: WriteExecutor = db): Promise<void> {
  await executor.insert(incidentEvents).values({
    incidentId: entry.incidentId,
    actorId: entry.actorId ?? null,
    actorName: entry.actorName ?? "System",
    type: entry.type,
    message: entry.message.slice(0, 400),
    fromValue: entry.fromValue ?? null,
    toValue: entry.toValue ?? null,
  });
}

export async function logEvent(entry: EventEntry): Promise<void> {
  try {
    await writeEvent(entry);
  } catch (err) {
    logBestEffortFailure("incident_event.write", err, { incidentId: entry.incidentId });
  }
}
