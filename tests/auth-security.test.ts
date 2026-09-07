import test from "node:test";
import assert from "node:assert/strict";
import { validateJwtSecret } from "../src/lib/auth";

test("JWT secret validation rejects missing, placeholder, and short secrets", () => {
  assert.throws(() => validateJwtSecret(undefined), /JWT_SECRET/);
  assert.throws(() => validateJwtSecret("dev-insecure-secret-change-me"), /JWT_SECRET/);
  assert.throws(() => validateJwtSecret("too-short"), /at least 32/);
});

test("JWT secret validation accepts a non-placeholder secret of at least 32 characters", () => {
  assert.equal(validateJwtSecret("a-strong-local-secret-that-is-32-chars!"), "a-strong-local-secret-that-is-32-chars!");
});