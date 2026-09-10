import type { Client, Transaction } from "@libsql/client";
import { client } from "@/db";
import { logBestEffortFailure } from "./logging";

export interface RateRule {
  max: number;
  windowMinutes: number;
}

export const RATE_RULES: Record<string, RateRule> = {
  loginEmail: { max: 8, windowMinutes: 15 },
  loginIp: { max: 25, windowMinutes: 15 },
  register: { max: 5, windowMinutes: 60 },
  ai: { max: 30, windowMinutes: 60 },
  comment: { max: 60, windowMinutes: 60 },
};

type RateLimitClient = Pick<Client, "execute">;
type TransactionalRateLimitClient = RateLimitClient & Pick<Client, "transaction">;

function normalizedMatch(match: { subject?: string; ip?: string }): string {
  const subject = (match.subject ?? "").trim().toLowerCase();
  const ip = (match.ip ?? "").trim();
  return subject ? `subject:${subject}` : ip ? `ip:${ip}` : "";
}

function bucketKey(kind: string, match: { subject?: string; ip?: string }): string {
  return `${kind}:${normalizedMatch(match)}`;
}

/**
 * Atomically consumes one fixed-window allowance. The conditional upsert is a
 * single SQLite/libSQL statement, so concurrent callers cannot both observe an
 * available count and exceed the rule's maximum.
 */
export async function consumeRateLimitWithClient(
  database: RateLimitClient,
  kind: string,
  rule: RateRule,
  match: { subject?: string; ip?: string },
  now = new Date(),
): Promise<boolean> {
  const identity = normalizedMatch(match);
  if (!identity) return true;

  const windowMs = rule.windowMinutes * 60_000;
  const windowEndsAt = new Date((Math.floor(now.getTime() / windowMs) + 1) * windowMs).toISOString();
  const result = await database.execute({
    sql: `
      INSERT INTO rate_limit_buckets (key, count, window_ends_at, updated_at)
      VALUES (?, 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE
          WHEN julianday(rate_limit_buckets.window_ends_at) <= julianday(?) THEN 1
          ELSE rate_limit_buckets.count + 1
        END,
        window_ends_at = CASE
          WHEN julianday(rate_limit_buckets.window_ends_at) <= julianday(?) THEN excluded.window_ends_at
          ELSE rate_limit_buckets.window_ends_at
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE julianday(rate_limit_buckets.window_ends_at) <= julianday(?)
         OR rate_limit_buckets.count < ?
      RETURNING count
    `,
    args: [bucketKey(kind, match), windowEndsAt, now.toISOString(), now.toISOString(), now.toISOString(), rule.max],
  });
  return result.rows.length === 1;
}

async function rateLimitAvailableWithClient(
  database: RateLimitClient,
  kind: string,
  rule: RateRule,
  match: { subject?: string; ip?: string },
  now = new Date(),
): Promise<boolean> {
  const identity = normalizedMatch(match);
  if (!identity) return true;

  const result = await database.execute({
    sql: "SELECT count, window_ends_at FROM rate_limit_buckets WHERE key = ?",
    args: [bucketKey(kind, match)],
  });
  const bucket = result.rows[0];
  return !bucket || new Date(String(bucket.window_ends_at)).getTime() <= now.getTime() || Number(bucket.count) < rule.max;
}

export async function consumeRateLimit(
  kind: string,
  rule: RateRule,
  match: { subject?: string; ip?: string },
): Promise<boolean> {
  try {
    return await consumeRateLimitWithClient(client, kind, rule, match);
  } catch (err) {
    logBestEffortFailure("rate_limit.consume", err, { kind });
    // Preserve the prior best-effort availability behavior if the limiter is unavailable.
    return true;
  }
}

export async function loginFailureAdmissionAllowedWithClient(
  database: RateLimitClient,
  email: string,
  ip: string,
): Promise<boolean> {
  const [byEmail, byIp] = await Promise.all([
    rateLimitAvailableWithClient(database, "login:email", RATE_RULES.loginEmail, { subject: email }),
    rateLimitAvailableWithClient(database, "login:ip", RATE_RULES.loginIp, { ip }),
  ]);
  return byEmail && byIp;
}

export async function loginFailureAdmissionAllowed(email: string, ip: string): Promise<boolean> {
  try {
    return await loginFailureAdmissionAllowedWithClient(client, email, ip);
  } catch (err) {
    logBestEffortFailure("rate_limit.login_admission", err);
    return true;
  }
}

export async function recordLoginFailureWithClient(
  database: TransactionalRateLimitClient,
  email: string,
  ip: string,
): Promise<boolean> {
  const transaction: Transaction = await database.transaction("write");
  try {
    const allowed = await loginFailureAdmissionAllowedWithClient(transaction, email, ip);
    if (!allowed) {
      await transaction.rollback();
      return false;
    }
    const [byEmail, byIp] = await Promise.all([
      consumeRateLimitWithClient(transaction, "login:email", RATE_RULES.loginEmail, { subject: email }),
      consumeRateLimitWithClient(transaction, "login:ip", RATE_RULES.loginIp, { ip }),
    ]);
    if (!byEmail || !byIp) {
      await transaction.rollback();
      return false;
    }
    await transaction.commit();
    return true;
  } catch (err) {
    await transaction.rollback().catch(() => undefined);
    throw err;
  }
}

export async function recordLoginFailure(email: string, ip: string): Promise<boolean> {
  try {
    return await recordLoginFailureWithClient(client, email, ip);
  } catch (err) {
    logBestEffortFailure("rate_limit.login_failure", err);
    return true;
  }
}

export function retryAfterMessage(rule: RateRule): string {
  return `Too many attempts. Try again in about ${rule.windowMinutes} minutes.`;
}
