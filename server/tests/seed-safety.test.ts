import assert from "node:assert/strict";
import test from "node:test";
import { assertSeedTarget } from "../src/db/seed-safety";

test("demo seed permits only local SQLite targets", () => {
  assert.doesNotThrow(() => assertSeedTarget("file:cleanops.db"));
  assert.doesNotThrow(() => assertSeedTarget(":memory:"));
});

test("demo seed rejects remote database targets before deleting data", () => {
  assert.throws(
    () => assertSeedTarget("libsql://production-example.turso.io"),
    /db:seed is restricted to local SQLite targets/,
  );
});
