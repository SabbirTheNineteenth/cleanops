import { Hono } from "hono";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidents, sites, workers } from "@/db/schema";
import { slaInfo } from "@/lib/sla";
import { sqlNow } from "@/lib/time";
import { logAudit } from "../activity";
import { parseDateRange } from "../query";
import { csvResponse, stamped, toCsv } from "../csv";
import { requireAuth, type Variables } from "../middleware";
import { addSlaRate, normalizeReportTally, reportCount } from "../reports";

export const reportRoutes = new Hono<{ Variables: Variables }>();

reportRoutes.use("*", requireAuth);

const resolutionMinutes = sql<number>`avg(case when ${incidents.status} = 'resolved' and ${incidents.resolvedAt} is not null then (julianday(${incidents.resolvedAt}) - julianday(${incidents.createdAt})) * 1440 end)`;

function tallyColumns(now: string) {
  return {
    total: sql<number>`count(${incidents.id})`,
    open: sql<number>`sum(case when ${incidents.status} != 'resolved' then 1 else 0 end)`,
    resolved: sql<number>`sum(case when ${incidents.status} = 'resolved' then 1 else 0 end)`,
    urgent: sql<number>`sum(case when ${incidents.severity} in ('high','critical') then 1 else 0 end)`,
    overdue: sql<number>`sum(case when ${incidents.status} != 'resolved' and ${incidents.dueAt} is not null and ${incidents.dueAt} < ${now} then 1 else 0 end)`,
    breached: sql<number>`sum(case when ${incidents.status} = 'resolved' and ${incidents.dueAt} is not null and ${incidents.resolvedAt} > ${incidents.dueAt} then 1 else 0 end)`,
    met: sql<number>`sum(case when ${incidents.status} = 'resolved' and ${incidents.dueAt} is not null and ${incidents.resolvedAt} <= ${incidents.dueAt} then 1 else 0 end)`,
    avgMinutes: resolutionMinutes,
  };
}

reportRoutes.get("/overview", async (c) => {
  const range = parseDateRange(c);
  const now = sqlNow();
  const window = and(gte(incidents.createdAt, range.from), lte(incidents.createdAt, range.to));

  const [tally, byStatus, bySeverity, trend, topSites] = await Promise.all([
    db.select(tallyColumns(now)).from(incidents).where(window).get(),
    db
      .select({ key: incidents.status, total: sql<number>`count(*)` })
      .from(incidents)
      .where(window)
      .groupBy(incidents.status)
      .all(),
    db
      .select({ key: incidents.severity, total: sql<number>`count(*)` })
      .from(incidents)
      .where(window)
      .groupBy(incidents.severity)
      .all(),
    db
      .select({
        day: sql<string>`substr(${incidents.createdAt}, 1, 10)`,
        total: sql<number>`count(*)`,
        resolved: sql<number>`sum(case when ${incidents.status} = 'resolved' then 1 else 0 end)`,
      })
      .from(incidents)
      .where(window)
      .groupBy(sql`substr(${incidents.createdAt}, 1, 10)`)
      .orderBy(sql`substr(${incidents.createdAt}, 1, 10)`)
      .all(),
    db
      .select({
        siteId: sites.id,
        name: sites.name,
        code: sites.code,
        total: sql<number>`count(${incidents.id})`,
      })
      .from(incidents)
      .innerJoin(sites, eq(incidents.siteId, sites.id))
      .where(window)
      .groupBy(sites.id)
      .orderBy(sql`count(${incidents.id}) desc`)
      .limit(5)
      .all(),
  ]);

  const base = normalizeReportTally(tally);

  return c.json({
    range,
    summary: addSlaRate(base),
    byStatus: byStatus.map((row) => ({ key: row.key, total: reportCount(row.total) })),
    bySeverity: bySeverity.map((row) => ({ key: row.key, total: reportCount(row.total) })),
    trend: trend.map((row) => ({
      day: row.day,
      total: reportCount(row.total),
      resolved: reportCount(row.resolved),
    })),
    topSites: topSites.map((row) => ({ ...row, total: reportCount(row.total) })),
  });
});

reportRoutes.get("/sites", async (c) => {
  const range = parseDateRange(c);
  const now = sqlNow();

  const rows = await db
    .select({
      siteId: sites.id,
      name: sites.name,
      code: sites.code,
      location: sites.location,
      status: sites.status,
      ...tallyColumns(now),
    })
    .from(sites)
    .leftJoin(
      incidents,
      and(
        eq(incidents.siteId, sites.id),
        gte(incidents.createdAt, range.from),
        lte(incidents.createdAt, range.to),
      ),
    )
    .groupBy(sites.id)
    .orderBy(sql`count(${incidents.id}) desc`, sites.name)
    .all();

  const data = rows.map((row) =>
    addSlaRate({
      siteId: row.siteId,
      name: row.name,
      code: row.code,
      location: row.location,
      status: row.status,
      total: reportCount(row.total),
      open: reportCount(row.open),
      resolved: reportCount(row.resolved),
      urgent: reportCount(row.urgent),
      overdue: reportCount(row.overdue),
      breached: reportCount(row.breached),
      met: reportCount(row.met),
      avgMinutes: reportCount(row.avgMinutes),
    }),
  );

  if (c.req.query("format") === "csv") {
    const csv = toCsv(
      ["Site", "Code", "Location", "Total", "Open", "Resolved", "High+Critical", "Overdue", "SLA met", "SLA breached", "SLA %", "Avg resolution"],
      data.map((row) => [
        row.name,
        row.code,
        row.location,
        row.total,
        row.open,
        row.resolved,
        row.urgent,
        row.overdue,
        row.met,
        row.breached,
        row.slaRate ?? "",
        row.avgResolution,
      ]),
    );
    await logAudit(c, { action: "export", entity: "report", detail: `sites ${range.from} → ${range.to}` });
    return csvResponse(c, stamped("report-sites"), csv);
  }

  return c.json({ range, data });
});

reportRoutes.get("/workers", async (c) => {
  const range = parseDateRange(c);
  const now = sqlNow();

  const rows = await db
    .select({
      workerId: workers.id,
      name: workers.name,
      role: workers.role,
      status: workers.status,
      ...tallyColumns(now),
    })
    .from(workers)
    .leftJoin(
      incidents,
      and(
        eq(incidents.assignedTo, workers.id),
        gte(incidents.createdAt, range.from),
        lte(incidents.createdAt, range.to),
      ),
    )
    .groupBy(workers.id)
    .orderBy(sql`count(${incidents.id}) desc`, workers.name)
    .all();

  const data = rows.map((row) =>
    addSlaRate({
      workerId: row.workerId,
      name: row.name,
      role: row.role,
      status: row.status,
      total: reportCount(row.total),
      open: reportCount(row.open),
      resolved: reportCount(row.resolved),
      urgent: reportCount(row.urgent),
      overdue: reportCount(row.overdue),
      breached: reportCount(row.breached),
      met: reportCount(row.met),
      avgMinutes: reportCount(row.avgMinutes),
    }),
  );

  if (c.req.query("format") === "csv") {
    const csv = toCsv(
      ["Worker", "Role", "Status", "Total", "Open", "Resolved", "High+Critical", "Overdue", "SLA met", "SLA breached", "SLA %", "Avg resolution"],
      data.map((row) => [
        row.name,
        row.role,
        row.status,
        row.total,
        row.open,
        row.resolved,
        row.urgent,
        row.overdue,
        row.met,
        row.breached,
        row.slaRate ?? "",
        row.avgResolution,
      ]),
    );
    await logAudit(c, { action: "export", entity: "report", detail: `workers ${range.from} → ${range.to}` });
    return csvResponse(c, stamped("report-workers"), csv);
  }

  return c.json({ range, data });
});

reportRoutes.get("/categories", async (c) => {
  const range = parseDateRange(c);
  const now = sqlNow();

  const rows = await db
    .select({
      category: incidents.category,
      ...tallyColumns(now),
    })
    .from(incidents)
    .where(and(gte(incidents.createdAt, range.from), lte(incidents.createdAt, range.to)))
    .groupBy(incidents.category)
    .orderBy(sql`count(${incidents.id}) desc`)
    .all();

  const data = rows.map((row) =>
    addSlaRate({
      category: row.category,
      total: reportCount(row.total),
      open: reportCount(row.open),
      resolved: reportCount(row.resolved),
      urgent: reportCount(row.urgent),
      overdue: reportCount(row.overdue),
      breached: reportCount(row.breached),
      met: reportCount(row.met),
      avgMinutes: reportCount(row.avgMinutes),
    }),
  );

  if (c.req.query("format") === "csv") {
    const csv = toCsv(
      ["Category", "Total", "Open", "Resolved", "High+Critical", "Overdue", "SLA met", "SLA breached", "SLA %", "Avg resolution"],
      data.map((row) => [
        row.category,
        row.total,
        row.open,
        row.resolved,
        row.urgent,
        row.overdue,
        row.met,
        row.breached,
        row.slaRate ?? "",
        row.avgResolution,
      ]),
    );
    await logAudit(c, { action: "export", entity: "report", detail: `categories ${range.from} → ${range.to}` });
    return csvResponse(c, stamped("report-categories"), csv);
  }

  return c.json({ range, data });
});

reportRoutes.get("/sla", async (c) => {
  const range = parseDateRange(c);
  const now = sqlNow();

  const [tally, breaches, atRisk] = await Promise.all([
    db
      .select(tallyColumns(now))
      .from(incidents)
      .where(and(gte(incidents.createdAt, range.from), lte(incidents.createdAt, range.to)))
      .get(),
    db
      .select({
        id: incidents.id,
        title: incidents.title,
        severity: incidents.severity,
        status: incidents.status,
        dueAt: incidents.dueAt,
        resolvedAt: incidents.resolvedAt,
        createdAt: incidents.createdAt,
        aiResponseWindow: incidents.aiResponseWindow,
        siteName: sites.name,
        workerName: workers.name,
      })
      .from(incidents)
      .leftJoin(sites, eq(incidents.siteId, sites.id))
      .leftJoin(workers, eq(incidents.assignedTo, workers.id))
      .where(
        and(
          eq(incidents.status, "resolved"),
          sql`${incidents.dueAt} is not null`,
          sql`${incidents.resolvedAt} > ${incidents.dueAt}`,
          gte(incidents.createdAt, range.from),
          lte(incidents.createdAt, range.to),
        ),
      )
      .orderBy(sql`${incidents.resolvedAt} desc`)
      .limit(25)
      .all(),
    db
      .select({
        id: incidents.id,
        title: incidents.title,
        severity: incidents.severity,
        status: incidents.status,
        dueAt: incidents.dueAt,
        resolvedAt: incidents.resolvedAt,
        createdAt: incidents.createdAt,
        aiResponseWindow: incidents.aiResponseWindow,
        siteName: sites.name,
        workerName: workers.name,
      })
      .from(incidents)
      .leftJoin(sites, eq(incidents.siteId, sites.id))
      .leftJoin(workers, eq(incidents.assignedTo, workers.id))
      .where(and(sql`${incidents.status} != 'resolved'`, sql`${incidents.dueAt} is not null`))
      .orderBy(incidents.dueAt)
      .limit(25)
      .all(),
  ]);

  const summary = addSlaRate(normalizeReportTally(tally));

  const decorate = (row: (typeof breaches)[number]) => ({ ...row, sla: slaInfo(row) });
  const risk = atRisk.map(decorate).filter((row) => row.sla.state === "overdue" || row.sla.state === "due_soon");

  if (c.req.query("format") === "csv") {
    const csv = toCsv(
      ["ID", "Title", "Site", "Worker", "Severity", "Status", "Due", "Resolved", "SLA"],
      [...breaches.map(decorate), ...risk].map((row) => [
        row.id,
        row.title,
        row.siteName ?? "",
        row.workerName ?? "Unassigned",
        row.severity,
        row.status,
        row.dueAt ?? "",
        row.resolvedAt ?? "",
        row.sla.label,
      ]),
    );
    await logAudit(c, { action: "export", entity: "report", detail: `sla ${range.from} → ${range.to}` });
    return csvResponse(c, stamped("report-sla"), csv);
  }

  return c.json({ range, summary, breaches: breaches.map(decorate), atRisk: risk });
});
