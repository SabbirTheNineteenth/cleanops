import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, incidents, sites, triageOutbox } from "@/db/schema";
import { computeDueAt } from "@/lib/sla";
import { sqlNow } from "@/lib/time";
import { analyzeIncident } from "./ai";
import { writeEvent } from "./activity";

export type TriageStatus = "pending" | "processing" | "completed" | "failed";
const MAX_ATTEMPTS = 5;

export function isPendingTriage(status: string | null | undefined): boolean {
  return status === "pending" || status === "processing";
}

type TriageWriteDatabase = Pick<typeof db, "insert">;

/** Persist work in the caller's transaction; never schedule process-local work. */
export async function enqueueIncidentTriage(
  incidentId: number,
  database: TriageWriteDatabase = db,
): Promise<void> {
  await database.insert(triageOutbox).values({ incidentId, status: "pending" });
}

async function claimNext() {
  const candidate = await db.select().from(triageOutbox)
    .where(and(eq(triageOutbox.status, "pending"), lte(triageOutbox.availableAt, sqlNow())))
    .orderBy(triageOutbox.id).limit(1).get();
  if (!candidate) return null;
  const claimed = await db.update(triageOutbox).set({
    status: "processing", attempts: sql`${triageOutbox.attempts} + 1`, claimedAt: sqlNow(), updatedAt: sqlNow(),
  }).where(and(eq(triageOutbox.id, candidate.id), eq(triageOutbox.status, "pending"))).returning().get();
  return claimed ?? null;
}

async function processClaim(job: NonNullable<Awaited<ReturnType<typeof claimNext>>>) {
  const row = await db.select().from(incidents).where(eq(incidents.id, job.incidentId)).get();
  if (!row) {
    await db.update(triageOutbox).set({ status: "completed", completedAt: sqlNow(), updatedAt: sqlNow() }).where(eq(triageOutbox.id, job.id));
    return;
  }
  const site = await db.select({ name: sites.name }).from(sites).where(eq(sites.id, row.siteId)).get();
  await db.update(incidents).set({ aiStatus: "processing", updatedAt: sqlNow() }).where(eq(incidents.id, row.id));
  try {
    const ai = await analyzeIncident({ title: row.title, description: row.description, category: row.category, siteName: site?.name });
    await db.transaction(async (tx) => {
      await tx.update(incidents).set({ aiSummary: ai.summary, aiSeverity: ai.severity, aiSuggestedAction: ai.suggestedAction, aiRecommendedRole: ai.recommendedRole, aiResponseWindow: ai.responseWindow, aiSource: ai.source, aiStatus: "completed", dueAt: row.dueAt ?? computeDueAt(row.severity, ai.responseWindow), updatedAt: sqlNow() }).where(eq(incidents.id, row.id));
      await tx.update(triageOutbox).set({ status: "completed", completedAt: sqlNow(), updatedAt: sqlNow(), lastError: null }).where(eq(triageOutbox.id, job.id));
      await writeEvent({ incidentId: row.id, type: "ai", message: `AI analysis completed (${ai.source})`, actorName: "System" }, tx);
    });
  } catch (error) {
    const retry = job.attempts < MAX_ATTEMPTS;
    await db.transaction(async (tx) => {
      await tx.update(triageOutbox).set({ status: retry ? "pending" : "failed", availableAt: retry ? sql`datetime('now', '+5 minutes')` : job.availableAt, lastError: error instanceof Error ? error.message.slice(0, 500) : "unknown failure", updatedAt: sqlNow() }).where(eq(triageOutbox.id, job.id));
      await tx.update(incidents).set({ aiStatus: retry ? "pending" : "failed", updatedAt: sqlNow() }).where(eq(incidents.id, row.id));
      await tx.insert(auditLogs).values({ actorEmail: "system", action: "analyze_failed", entity: "incident", entityId: row.id, detail: "triage worker failure", ip: "", userAgent: "" });
    });
  }
}

/** Reclaim abandoned leases and process a bounded batch for serverless cron invocations. */
export async function runPendingTriage(limit = 10): Promise<number> {
  await db.update(triageOutbox).set({ status: "pending", updatedAt: sqlNow() })
    .where(and(eq(triageOutbox.status, "processing"), lte(triageOutbox.claimedAt, sql`datetime('now', '-15 minutes')`)));
  let processed = 0;
  while (processed < limit) {
    const job = await claimNext();
    if (!job) break;
    await processClaim(job);
    processed += 1;
  }
  return processed;
}
