import assert from "node:assert/strict";
import test from "node:test";
import { addSlaRate, normalizeReportTally } from "../src/server/reports";

test("normalizeReportTally converts nullable aggregate values into stable tally values", () => {
  assert.deepEqual(
    normalizeReportTally({ total: "4", open: null, resolved: 2, urgent: undefined, overdue: "not-a-number", breached: 1, met: 3, avgMinutes: 89.7 }),
    { total: 4, open: 0, resolved: 2, urgent: 0, overdue: 0, breached: 1, met: 3, avgMinutes: 90 },
  );
});

test("addSlaRate preserves row fields and derives SLA metrics", () => {
  assert.deepEqual(
    addSlaRate({ total: 4, open: 1, resolved: 3, urgent: 2, overdue: 0, breached: 1, met: 3, avgMinutes: 90 }),
    { total: 4, open: 1, resolved: 3, urgent: 2, overdue: 0, breached: 1, met: 3, avgMinutes: 90, slaRate: 75, avgResolution: "1h 30m" },
  );
  assert.equal(addSlaRate({ total: 0, open: 0, resolved: 0, urgent: 0, overdue: 0, breached: 0, met: 0, avgMinutes: 0 }).slaRate, null);
});
