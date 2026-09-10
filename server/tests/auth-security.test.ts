import assert from "node:assert/strict";
import test from "node:test";
import { clearCookieOptions, sessionCookieOptions, validateJwtSecret } from "../src/lib/auth";
import { databaseClientConfig } from "../src/db/config";
import { clientIp } from "../src/server/activity";

test("JWT secret validation rejects missing, placeholder, and short secrets", () => {
  assert.throws(() => validateJwtSecret(undefined), /JWT_SECRET/);
  assert.throws(() => validateJwtSecret("dev-insecure-secret-change-me"), /JWT_SECRET/);
  assert.throws(() => validateJwtSecret("too-short"), /at least 32/);
});

test("JWT secret validation accepts a non-placeholder secret of at least 32 characters", () => {
  assert.equal(validateJwtSecret("a-strong-local-secret-that-is-32-chars!"), "a-strong-local-secret-that-is-32-chars!");
});

test("session cookies can be shared safely across configured sibling subdomains", () => {
  const previous = process.env.SESSION_COOKIE_DOMAIN;
  process.env.SESSION_COOKIE_DOMAIN = ".cleanops.example";
  assert.equal(sessionCookieOptions().domain, ".cleanops.example");
  assert.equal(clearCookieOptions().domain, ".cleanops.example");
  process.env.SESSION_COOKIE_DOMAIN = previous;
});

test("untrusted forwarding headers cannot control the rate-limit identity", () => {
  const context = { req: { header: (name: string) => name === "x-forwarded-for" ? "203.0.113.77" : undefined } };
  assert.equal(clientIp(context as never), "");
});

test("Vercel production requires a durable remote database URL", () => {
  assert.throws(() => databaseClientConfig({ NODE_ENV: "production", VERCEL: "1" }), /DATABASE_URL/);
  assert.throws(() => databaseClientConfig({ NODE_ENV: "production", VERCEL: "1", DATABASE_URL: "file:cleanops.db" }), /durable remote/);
  assert.equal(
    databaseClientConfig({
      NODE_ENV: "production",
      VERCEL: "1",
      DATABASE_URL: "libsql://cleanops.example",
      DATABASE_AUTH_TOKEN: "test",
    }).url,
    "libsql://cleanops.example",
  );
});