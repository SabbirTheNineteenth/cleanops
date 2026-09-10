import { Hono } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidents, notifications, sites, workers, users } from "@/db/schema";
import { slaInfo } from "@/lib/sla";
import { sqlNow } from "@/lib/time";
import { requireAuth, type Variables } from "../middleware";

export const statsRoutes = new Hono<{ Variables: Variables }>();

statsRoutes.use("*", requireAuth);

const num = (value: unknown) => Number(value ?? 0);

statsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const userId = Number(user.sub);
  const now = sqlNow();

  const [siteTally, workerTally, incidentTally, pendingRow, unreadRow, byStatus, bySeverity, trendRows, recent, watchRows] =
    await Promise.all([
      db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`sum(case when ${sites.status} = 'active' then 1 else 0 end)`,
        })
        .from(sites)
        .get(),
      db
        .select({
          total: sql<number>`count(*)`,
          available: sql<number>`sum(case when ${workers.status} = 'available' then 1 else 0 end)`,
          linked: sql<number>`sum(case when ${workers.userId} is not null then 1 else 0 end)`,
        })
        .from(workers)
        .get(),
      db
        .select({
          total: sql<number>`count(*)`,
          open: sql<number>`sum(case when ${incidents.status} != 'resolved' then 1 else 0 end)`,
          unassigned: sql<number>`sum(case when ${incidents.assignedTo} is null and ${incidents.status} != 'resolved' then 1 else 0 end)`,
          overdue: sql<number>`sum(case when ${incidents.status} != 'resolved' and ${incidents.dueAt} is not null and ${incidents.dueAt} < ${now} then 1 else 0 end)`,
          dueSoon: sql<number>`sum(case when ${incidents.status} != 'resolved' and ${incidents.dueAt} is not null and ${incidents.dueAt} >= ${now} and ${incidents.dueAt} <= datetime(${now}, '+2 hours') then 1 else 0 end)`,
          breached: sql<number>`sum(case when ${incidents.status} = 'resolved' and ${incidents.dueAt} is not null and ${incidents.resolvedAt} > ${incidents.dueAt} then 1 else 0 end)`,
          met: sql<number>`sum(case when ${incidents.status} = 'resolved' and ${incidents.dueAt} is not null and ${incidents.resolvedAt} <= ${incidents.dueAt} then 1 else 0 end)`,
        })
        .from(incidents)
        .get(),
      db
        .select({ total: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.status, "pending"))
        .get(),
      db
        .select({ total: sql<number>`count(*)` })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
        .get(),
      db
        .select({ key: incidents.status, total: sql<number>`count(*)` })
        .from(incidents)
        .groupBy(incidents.status)
        .all(),
      db
        .select({ key: incidents.severity, total: sql<number>`count(*)` })
        .from(incidents)
        .groupBy(incidents.severity)
        .all(),
      db
        .select({
          day: sql<string>`substr(${incidents.createdAt}, 1, 10)`,
          total: sql<number>`count(*)`,
        })
        .from(incidents)
        .where(sql`${incidents.createdAt} >= datetime(${now}, '-6 days')`)
        .groupBy(sql`substr(${incidents.createdAt}, 1, 10)`)
        .all(),
      db
        .select({
          id: incidents.id,
          title: incidents.title,
          status: incidents.status,
          severity: incidents.severity,
          siteName: sites.name,
          workerName: workers.name,
          dueAt: incidents.dueAt,
          resolvedAt: incidents.resolvedAt,
          aiResponseWindow: incidents.aiResponseWindow,
          createdAt: incidents.createdAt,
        })
        .from(incidents)
        .leftJoin(sites, eq(incidents.siteId, sites.id))
        .leftJoin(workers, eq(incidents.assignedTo, workers.id))
        .orderBy(desc(incidents.createdAt))
        .limit(6)
        .all(),
      db
        .select({
          id: incidents.id,
          title: incidents.title,
          status: incidents.status,
          severity: incidents.severity,
          siteName: sites.name,
          workerName: workers.name,
          dueAt: incidents.dueAt,
          resolvedAt: incidents.resolvedAt,
          aiResponseWindow: incidents.aiResponseWindow,
          createdAt: incidents.createdAt,
        })
        .from(incidents)
        .leftJoin(sites, eq(incidents.siteId, sites.id))
        .leftJoin(workers, eq(incidents.assignedTo, workers.id))
        .where(and(sql`${incidents.status} != 'resolved'`, sql`${incidents.dueAt} is not null`))
        .orderBy(incidents.dueAt)
        .limit(8)
        .all(),
    ]);

  const statusMap = { open: 0, assigned: 0, in_progress: 0, resolved: 0 };
  for (const row of byStatus) {
    statusMap[row.key as keyof typeof statusMap] = num(row.total);
  }
  const severityMap = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const row of bySeverity) {
    severityMap[row.key as keyof typeof severityMap] = num(row.total);
  }

  const trendIndex = new Map(trendRows.map((row) => [row.day, num(row.total)]));
  const trend: { date: string; count: number }[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - offset);
    const key = day.toISOString().slice(0, 10);
    trend.push({ date: key, count: trendIndex.get(key) ?? 0 });
  }

  const judged = num(incidentTally?.met) + num(incidentTally?.breached);
  const attention = watchRows
    .map((row) => ({ ...row, sla: slaInfo(row) }))
    .filter((row) => row.sla.state === "overdue" || row.sla.state === "due_soon")
    .slice(0, 6);

  return c.json({
    totals: {
      sites: num(siteTally?.total),
      activeSites: num(siteTally?.active),
      workers: num(workerTally?.total),
      availableWorkers: num(workerTally?.available),
      linkedWorkers: num(workerTally?.linked),
      incidents: num(incidentTally?.total),
      openIncidents: num(incidentTally?.open),
      unassigned: num(incidentTally?.unassigned),
      pendingApprovals: num(pendingRow?.total),
      unreadNotifications: num(unreadRow?.total),
    },
    sla: {
      overdue: num(incidentTally?.overdue),
      dueSoon: num(incidentTally?.dueSoon),
      breached: num(incidentTally?.breached),
      met: num(incidentTally?.met),
      complianceRate: judged ? Math.round((num(incidentTally?.met) / judged) * 100) : null,
    },
    byStatus: statusMap,
    bySeverity: severityMap,
    trend,
    recent: recent.map((row) => ({ ...row, sla: slaInfo(row) })),
    attention,
  });
});
