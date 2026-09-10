import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { authAttempts } from "@/db/schema";
import { minutesAgo } from "@/lib/time";
import { logBestEffortFailure } from "./logging";

export interface RateRule {
  max: number;
  windowMinutes: number;
  failuresOnly?: boolean;
}

export const RATE_RULES: Record<string, RateRule> = {
  loginEmail: { max: 8, windowMinutes: 15, failuresOnly: true },
  loginIp: { max: 25, windowMinutes: 15, failuresOnly: true },
  register: { max: 5, windowMinutes: 60 },
  ai: { max: 30, windowMinutes: 60 },
  comment: { max: 60, windowMinutes: 60 },
};

export async function recordAttempt(
  kind: string,
  options: { subject?: string; ip?: string; success?: boolean },
): Promise<void> {
  try {
    await db.insert(authAttempts).values({
      kind,
      email: (options.subject ?? "").slice(0, 160).toLowerCase(),
      ip: (options.ip ?? "").slice(0, 64),
      success: options.success ?? false,
    });
    if (Math.random() < 0.05) {
      await db.delete(authAttempts).where(sql`created_at < ${minutesAgo(60 * 24)}`);
    }
  } catch (err) {
    logBestEffortFailure("rate_limit.record", err, { kind });
  }
}

export async function attemptCount(
  kind: string,
  rule: RateRule,
  match: { subject?: string; ip?: string },
): Promise<number> {
  const subject = (match.subject ?? "").trim().toLowerCase();
  const ip = (match.ip ?? "").trim();
  if (!subject && !ip) return 0;
  try {
    const conditions = [
      eq(authAttempts.kind, kind),
      gte(authAttempts.createdAt, minutesAgo(rule.windowMinutes)),
    ];
    if (subject) conditions.push(eq(authAttempts.email, subject));
    if (ip) conditions.push(eq(authAttempts.ip, ip));
    if (rule.failuresOnly) conditions.push(eq(authAttempts.success, false));

    const row = await db
      .select({ total: sql<number>`count(*)` })
      .from(authAttempts)
      .where(and(...conditions))
      .get();
    return Number(row?.total ?? 0);
  } catch (err) {
    logBestEffortFailure("rate_limit.count", err, { kind });
    return 0;
  }
}

export async function overLimit(
  kind: string,
  rule: RateRule,
  match: { subject?: string; ip?: string },
): Promise<boolean> {
  return (await attemptCount(kind, rule, match)) >= rule.max;
}

export async function loginBlocked(email: string, ip: string): Promise<boolean> {
  const [byEmail, byIp] = await Promise.all([
    overLimit("login", RATE_RULES.loginEmail, { subject: email }),
    overLimit("login", RATE_RULES.loginIp, { ip }),
  ]);
  return byEmail || byIp;
}

export async function registerBlocked(ip: string): Promise<boolean> {
  return overLimit("register", RATE_RULES.register, { ip });
}

export async function aiBlocked(userId: number | string): Promise<boolean> {
  return overLimit("ai", RATE_RULES.ai, { subject: `user:${userId}` });
}

export function retryAfterMessage(rule: RateRule): string {
  return `Too many attempts. Try again in about ${rule.windowMinutes} minutes.`;
}
