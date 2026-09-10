import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiOrigin, resolveApiUrl } from "../src/lib/api";

test("resolveApiOrigin falls back to the same-origin proxy when public configuration is absent", () => {
  assert.equal(resolveApiOrigin(undefined), "/api");
});

test("resolveApiUrl creates one canonical API request URL", () => {
  assert.equal(resolveApiUrl("/auth/me", "https://api.cleanops.example/api/"), "https://api.cleanops.example/api/auth/me");
  assert.equal(resolveApiUrl("health", "http://localhost:3000/api"), "http://localhost:3000/api/health");
});
