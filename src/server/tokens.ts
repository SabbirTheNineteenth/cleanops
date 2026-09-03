import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { emailTokens } from "@/db/schema";
import { addMinutes, parseTime, sqlNow, toSqlTime } from "@/lib/time";

export const VERIFY_TTL_MINUTES = 60 * 24;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createEmailToken(
  userId: number,
  purpose = "verify_email",
  ttlMinutes = VERIFY_TTL_MINUTES,
): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await db.insert(emailTokens).values({
    userId,
    tokenHash: hashToken(raw),
    purpose,
    expiresAt: toSqlTime(addMinutes(new Date(), ttlMinutes)),
  });
  return raw;
}

export async function consumeEmailToken(
  raw: string,
  purpose = "verify_email",
): Promise<{ userId: number } | null> {
  if (!raw || raw.length < 32) return null;
  const row = await db
    .select()
    .from(emailTokens)
    .where(and(eq(emailTokens.tokenHash, hashToken(raw)), eq(emailTokens.purpose, purpose)))
    .get();
  if (!row || row.usedAt) return null;

  const expires = parseTime(row.expiresAt);
  if (!expires || expires.getTime() < Date.now()) return null;

  await db.update(emailTokens).set({ usedAt: sqlNow() }).where(eq(emailTokens.id, row.id));
  return { userId: row.userId };
}

export async function invalidateTokens(
  userId: number,
  purpose = "verify_email",
): Promise<void> {
  await db
    .update(emailTokens)
    .set({ usedAt: sqlNow() })
    .where(
      and(
        eq(emailTokens.userId, userId),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
      ),
    );
}

export function newSessionId(): string {
  return randomBytes(18).toString("hex");
}
