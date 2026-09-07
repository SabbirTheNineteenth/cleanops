import test from "node:test";
import assert from "node:assert/strict";
import { requestedIncidentStatus, toIncidentDueAt } from "../src/server/incident-helpers";

test("requestedIncidentStatus auto-assigns only an open incident receiving an assignee", () => {
  assert.equal(requestedIncidentStatus(undefined, 8, "open"), "assigned");
  assert.equal(requestedIncidentStatus(undefined, 8, "assigned"), undefined);
  assert.equal(requestedIncidentStatus(undefined, null, "open"), undefined);
  assert.equal(requestedIncidentStatus("in_progress", 8, "open"), "in_progress");
});

test("toIncidentDueAt normalizes valid input and rejects invalid dates", () => {
  assert.equal(toIncidentDueAt("2026-03-10 12:30:00"), "2026-03-10 12:30:00");
  assert.equal(toIncidentDueAt(""), null);
  assert.equal(toIncidentDueAt(null), null);
  assert.equal(toIncidentDueAt("not a date"), undefined);
});
