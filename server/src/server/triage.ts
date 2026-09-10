import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, incidents, sites } from "@/db/schema";
import { computeDueAt } from "@/lib/sla";
import { sqlNow } from "@/lib/time";
import { analyzeIncident } from "./ai";
import { writeEvent } from "./activity";

export type TriageStatus = "pending" | "processing" | "completed" | "failed";

const queued = new Set<number>();

export function isPendingTriage(status: string | null | undefined): boolean {
  return status === "pending" || status === "processing";
}

export function enqueueIncidentTriage(incidentId: number): void {
  if (queued.has(incidentId)) return;
  queued.add(incidentId);
  setTimeout(() => {
    void runIncidentTriage(incidentId).finally(() => queued.delete(incidentId));
  }, 0);
}

async function runIncidentTriage(incidentId: number): Promise<void> {
  const row = await db.select().from(incidents).where(eq(incidents.id, incidentId)).get();
  if (!row || row.aiStatus !== "pending") return;
  const site = await db.select({ name: sites.name }).from(sites).where(eq(sites.id, row.siteId)).get();

  await db.transaction(async (tx) => {
    await tx.update(incidents).set({ aiStatus: "processing", updatedAt: sqlNow() })
      .where(eq(incidents.id, incidentId));
    await writeEvent({
      incidentId,
      type: "ai",
      message: "AI analysis started",
      actorName: "System",
    }, tx);
    await tx.insert(auditLogs).values({
      actorEmail: "system",
      action: "analyze_started",
      entity: "incident",
      entityId: incidentId,
      detail: "processing",
      ip: "",
      userAgent: "",
    });
  });

  try {
    const ai = await analyzeIncident({
      title: row.title,
      description: row.description,
      category: row.category,
      siteName: site?.name,
    });
    await db.transaction(async (tx) => {
      await tx.update(incidents).set({
        aiSummary: ai.summary,
        aiSeverity: ai.severity,
        aiSuggestedAction: ai.suggestedAction,
        aiRecommendedRole: ai.recommendedRole,
        aiResponseWindow: ai.responseWindow,
        aiSource: ai.source,
        aiStatus: "completed",
        dueAt: row.dueAt ?? computeDueAt(row.severity, ai.responseWindow),
        updatedAt: sqlNow(),
      }).where(eq(incidents.id, incidentId));
      await writeEvent({
        incidentId,
        type: "ai",
        message: `AI analysis completed (${ai.source}) suggested ${ai.severity} severity`,
        actorName: "System",
        toValue: ai.severity,
      }, tx);
      await tx.insert(auditLogs).values({
        actorEmail: "system",
        action: "analyze_complete",
        entity: "incident",
        entityId: incidentId,
        detail: `source ${ai.source}`,
        ip: "",
        userAgent: "",
      });
    });
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx.update(incidents).set({ aiStatus: "failed", updatedAt: sqlNow() })
        .where(eq(incidents.id, incidentId));
      await writeEvent({
        incidentId,
        type: "ai",
        message: "AI analysis failed; retry is available",
        actorName: "System",
      }, tx);
      await tx.insert(auditLogs).values({
        actorEmail: "system",
        action: "analyze_failed",
        entity: "incident",
        entityId: incidentId,
        detail: error instanceof Error ? error.message.slice(0, 500) : "unknown failure",
        ip: "",
        userAgent: "",
      });
    });
  }
}
