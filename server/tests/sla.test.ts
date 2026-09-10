import test from "node:test";
import assert from "node:assert/strict";
import {
  SLA_MINUTES,
  SLA_STATE_LABEL,
  computeDueAt,
  slaInfo,
  slaMinutes,
} from "../src/lib/sla";
import { addMinutes, parseTime, toSqlTime } from "../src/lib/time";

const NOW = new Date("2026-03-05T10:00:00Z");
const due = (minutesFromNow: number) => toSqlTime(addMinutes(NOW, minutesFromNow));

test("slaMinutes maps severity to its budget", () => {
  assert.equal(slaMinutes("critical"), 60);
  assert.equal(slaMinutes("high"), 240);
  assert.equal(slaMinutes("medium"), 1440);
  assert.equal(slaMinutes("low"), 4320);
});

test("slaMinutes falls back to medium for unknown or missing severity", () => {
  assert.equal(slaMinutes(undefined), SLA_MINUTES.medium);
  assert.equal(slaMinutes(null), SLA_MINUTES.medium);
  assert.equal(slaMinutes("catastrophic"), SLA_MINUTES.medium);
});

test("an AI response window overrides the severity budget", () => {
  assert.equal(slaMinutes("low", "immediate"), 30);
  assert.equal(slaMinutes("low", "  Within 1 Hour  "), 60);
  assert.equal(slaMinutes("critical", "same day"), 480);
  assert.equal(slaMinutes("critical", "next scheduled visit"), 2880);
  assert.equal(slaMinutes("critical", "whenever"), 60);
});

test("the parenthetical the AI adds to a window is ignored", () => {
  assert.equal(slaMinutes("critical", "Immediate (dispatch now)"), 30);
  assert.equal(slaMinutes("low", "Same day (before close)"), 480);
});

test("computeDueAt adds the budget to the given moment", () => {
  assert.equal(computeDueAt("critical", null, NOW), "2026-03-05 11:00:00");
  assert.equal(computeDueAt("low", "immediate", NOW), "2026-03-05 10:30:00");
  assert.equal(
    parseTime(computeDueAt("high", null, NOW))!.getTime() - NOW.getTime(),
    240 * 60_000,
  );
});

test("no due date means no SLA", () => {
  const info = slaInfo({ status: "open", severity: "high" }, NOW);
  assert.equal(info.state, "none");
  assert.equal(info.dueAt, null);
  assert.equal(info.minutesLeft, null);
  assert.equal(info.overdue, false);
  assert.equal(info.tone, "neutral");
});

test("an open incident with time left is on track", () => {
  const info = slaInfo({ status: "open", severity: "medium", dueAt: due(600) }, NOW);
  assert.equal(info.state, "on_track");
  assert.equal(info.minutesLeft, 600);
  assert.equal(info.overdue, false);
  assert.equal(info.tone, "neutral");
  assert.equal(info.label, "Due in 10h");
});

test("the last quarter of the budget flips to due soon", () => {
  const info = slaInfo({ status: "in_progress", severity: "high", dueAt: due(50) }, NOW);
  assert.equal(info.state, "due_soon");
  assert.equal(info.tone, "warn");
});

test("the due soon threshold never drops below 15 minutes", () => {
  const info = slaInfo(
    { status: "open", severity: "critical", dueAt: due(15), aiResponseWindow: "immediate" },
    NOW,
  );
  assert.equal(info.state, "due_soon");
});

test("a past due date on an unresolved incident is overdue", () => {
  const info = slaInfo({ status: "assigned", severity: "critical", dueAt: due(-90) }, NOW);
  assert.equal(info.state, "overdue");
  assert.equal(info.overdue, true);
  assert.equal(info.tone, "bad");
  assert.equal(info.label, "Overdue by 1h 30m");
});

test("resolving before the due date meets the SLA", () => {
  const info = slaInfo(
    {
      status: "resolved",
      severity: "critical",
      dueAt: due(60),
      resolvedAt: due(20),
    },
    NOW,
  );
  assert.equal(info.state, "met");
  assert.equal(info.overdue, false);
  assert.equal(info.tone, "good");
  assert.equal(info.label, "Met SLA");
  assert.equal(info.minutesLeft, 40);
});

test("resolving after the due date breaches the SLA and reports the gap", () => {
  const info = slaInfo(
    {
      status: "resolved",
      severity: "critical",
      dueAt: due(60),
      resolvedAt: due(150),
    },
    NOW,
  );
  assert.equal(info.state, "breached");
  assert.equal(info.overdue, true);
  assert.equal(info.tone, "bad");
  assert.equal(info.label, "Missed SLA by 1h 30m");
});

test("a resolved incident with no resolvedAt is judged at the current moment", () => {
  const met = slaInfo({ status: "resolved", severity: "high", dueAt: due(30) }, NOW);
  const missed = slaInfo({ status: "resolved", severity: "high", dueAt: due(-30) }, NOW);
  assert.equal(met.state, "met");
  assert.equal(missed.state, "breached");
});

test("every SLA state has a label", () => {
  for (const state of ["none", "on_track", "due_soon", "overdue", "met", "breached"] as const) {
    assert.equal(typeof SLA_STATE_LABEL[state], "string");
    assert.ok(SLA_STATE_LABEL[state].length > 0);
  }
});
