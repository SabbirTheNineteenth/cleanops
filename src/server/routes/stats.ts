import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { incidents, sites, workers, users } from "@/db/schema";
import { requireAuth, type Variables } from "../middleware";

export const statsRoutes = new Hono<{ Variables: Variables }>();

statsRoutes.use("*", requireAuth);

statsRoutes.get("/", (c) => {
  const allIncidents = db.select().from(incidents).all();
  const allSites = db.select().from(sites).all();
  const allWorkers = db.select().from(workers).all();
  const pendingApprovals = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.status, "pending"))
    .all().length;

  const byStatus = { open: 0, assigned: 0, in_progress: 0, resolved: 0 };
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const i of allIncidents) {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
    bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
  }

  const days: { date: string; count: number }[] = [];
  for (let d = 6; d >= 0; d--) {
    const day = new Date();
    day.setDate(day.getDate() - d);
    const key = day.toISOString().slice(0, 10);
    const count = allIncidents.filter((i) =>
      (i.createdAt ?? "").startsWith(key),
    ).length;
    days.push({ date: key, count });
  }

  const recent = db
    .select({
      id: incidents.id,
      title: incidents.title,
      status: incidents.status,
      severity: incidents.severity,
      siteName: sites.name,
      createdAt: incidents.createdAt,
    })
    .from(incidents)
    .leftJoin(sites, eq(incidents.siteId, sites.id))
    .orderBy(desc(incidents.createdAt))
    .limit(6)
    .all();

  return c.json({
    totals: {
      sites: allSites.length,
      activeSites: allSites.filter((s) => s.status === "active").length,
      workers: allWorkers.length,
      availableWorkers: allWorkers.filter((w) => w.status === "available").length,
      incidents: allIncidents.length,
      openIncidents: byStatus.open + byStatus.assigned + byStatus.in_progress,
      pendingApprovals,
    },
    byStatus,
    bySeverity,
    trend: days,
    recent,
  });
});
