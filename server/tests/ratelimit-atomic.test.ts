import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  consumeRateLimitWithClient,
  loginFailureAdmissionAllowedWithClient,
  recordLoginFailureWithClient,
  RATE_RULES,
  type RateRule,
} from "../src/server/ratelimit";

const directory = mkdtempSync(join(tmpdir(), "cleanops-rate-limit-"));
const databasePath = join(directory, "rate-limit.db").replace(/\\/g, "/");
const client = createClient({ url: `file:${databasePath}` });
const rule: RateRule = { max: 3, windowMinutes: 1 };

async function createBucketsTable(): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      window_ends_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
    )
  `);
}

test.before(async () => createBucketsTable());
test.after(() => client.close());

test("concurrent bucket consumption never grants more than the configured allowance", async () => {
  const results = await Promise.all(
    Array.from({ length: 20 }, () => consumeRateLimitWithClient(client, "test-concurrent", rule, { subject: "person" })),
  );

  assert.equal(results.filter(Boolean).length, rule.max);
});

test("an expired bucket resets once and still caps concurrent requests at its allowance", async () => {
  const key = "test-boundary:subject:person";
  await client.execute({
    sql: "INSERT INTO rate_limit_buckets (key, count, window_ends_at) VALUES (?, ?, ?)",
    args: [key, 99, "2000-01-01T00:00:00.000Z"],
  });

  const results = await Promise.all(
    Array.from({ length: 20 }, () => consumeRateLimitWithClient(client, "test-boundary", rule, { subject: "person" })),
  );

  assert.equal(results.filter(Boolean).length, rule.max);
  const row = await client.execute({ sql: "SELECT count FROM rate_limit_buckets WHERE key = ?", args: [key] });
  assert.equal(row.rows[0]?.count, rule.max);
});

test("login admission rejects an exhausted email without consuming its IP companion bucket", async () => {
  const email = "exhausted@example.test";
  const ip = "203.0.113.50";
  await client.execute({
    sql: "INSERT INTO rate_limit_buckets (key, count, window_ends_at) VALUES (?, ?, ?)",
    args: ["login:email:subject:exhausted@example.test", RATE_RULES.loginEmail.max, "2999-01-01T00:00:00.000Z"],
  });

  assert.equal(await loginFailureAdmissionAllowedWithClient(client, email, ip), false);
  const companion = await client.execute({
    sql: "SELECT count FROM rate_limit_buckets WHERE key = ?",
    args: ["login:ip:ip:203.0.113.50"],
  });
  assert.equal(companion.rows.length, 0);
});

test("recording a failed login atomically leaves the email bucket untouched when its IP is exhausted", async () => {
  const email = "unconsumed@example.test";
  const ip = "203.0.113.51";
  await client.execute({
    sql: "INSERT INTO rate_limit_buckets (key, count, window_ends_at) VALUES (?, ?, ?)",
    args: ["login:ip:ip:203.0.113.51", RATE_RULES.loginIp.max, "2999-01-01T00:00:00.000Z"],
  });

  assert.equal(await recordLoginFailureWithClient(client, email, ip), false);
  const companion = await client.execute({
    sql: "SELECT count FROM rate_limit_buckets WHERE key = ?",
    args: ["login:email:subject:unconsumed@example.test"],
  });
  assert.equal(companion.rows.length, 0);
});
