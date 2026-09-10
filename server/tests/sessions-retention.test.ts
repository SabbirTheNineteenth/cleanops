import assert from "node:assert/strict";
import test from "node:test";
import { sessionRetentionBatch } from "../src/server/sessions";

test("session retention batch defaults safely and clamps configured values", () => {
  assert.equal(sessionRetentionBatch(undefined), 100);
  assert.equal(sessionRetentionBatch("not-a-number"), 100);
  assert.equal(sessionRetentionBatch("0"), 1);
  assert.equal(sessionRetentionBatch("250"), 250);
  assert.equal(sessionRetentionBatch("999"), 500);
});
