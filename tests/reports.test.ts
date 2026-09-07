import test from "node:test";
import assert from "node:assert/strict";
import { addSlaRate, normalizeReportTally } from "../src/server/reports";
import { dayStampAt, reportRowsFor, reportSearchParams } from "../src/app/(app)/reports/report-helpers";

test("normalizeReportTally converts nullable aggregate values into stable tally values", () => {
  assert.deepEqual(
    normalizeReportTally({
      total: "4",
      open: null,
      resolved: 2,
      urgent: undefined,
      overdue: "not-a-number",
      breached: 1,
      met: 3,
      avgMinutes: 89.7,
    }),
    { total: 4, open: 0, resolved: 2, urgent: 0, overdue: 0, breached: 1, met: 3, avgMinutes: 90 },
  );
});

test("addSlaRate preserves row fields and derives SLA metrics", () => {
  assert.deepEqual(
    addSlaRate({ total: 4, open: 1, resolved: 3, urgent: 2, overdue: 0, breached: 1, met: 3, avgMinutes: 90 }),
    {
      total: 4,
      open: 1,
      resolved: 3,
      urgent: 2,
      overdue: 0,
      breached: 1,
      met: 3,
      avgMinutes: 90,
      slaRate: 75,
      avgResolution: "1h 30m",
    },
  );
  assert.equal(
    addSlaRate({ total: 0, open: 0, resolved: 0, urgent: 0, overdue: 0, breached: 0, met: 0, avgMinutes: 0 }).slaRate,
    null,
  );
});

test("report client helpers derive date/query values from supplied inputs", () => {
  assert.equal(dayStampAt(new Date("2026-03-10T12:00:00Z"), 2), "2026-03-08");
  assert.equal(reportSearchParams("2026-03-01", "2026-03-10"), "from=2026-03-01&to=2026-03-10");
});

test("reportRowsFor consistently maps report data to table rows", () => {
  const tally = { total: 2, open: 1, resolved: 1, urgent: 0, overdue: 0, breached: 0, met: 1, slaRate: 100, avgResolution: "1h" };
  assert.deepEqual(reportRowsFor("sites", [{ ...tally, siteId: 4, name: "HQ", code: "HQ-1", location: "Dhaka", status: "active" }]), [
    { ...tally, siteId: 4, name: "HQ", code: "HQ-1", location: "Dhaka", status: "active", key: "site-4", label: "HQ", sub: "HQ-1 · Dhaka", href: "/sites/4" },
  ]);
  assert.deepEqual(reportRowsFor("categories", [{ ...tally, category: "Spill" }]), [
    { ...tally, category: "Spill", key: "cat-Spill", label: "Spill", sub: "" },
  ]);
});
