import test from "node:test";
import assert from "node:assert/strict";
import {
  addMinutes,
  dayKey,
  formatSpan,
  minutesAgo,
  minutesBetween,
  parseTime,
  sqlNow,
  timeAgo,
  toSqlTime,
} from "../src/lib/time";

const SQL_SHAPE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

test("toSqlTime renders the SQLite datetime shape in UTC", () => {
  assert.equal(toSqlTime(new Date("2026-03-05T14:07:09.512Z")), "2026-03-05 14:07:09");
  assert.match(toSqlTime(new Date()), SQL_SHAPE);
});

test("sqlNow and minutesAgo stay in the same format", () => {
  assert.match(sqlNow(), SQL_SHAPE);
  assert.match(minutesAgo(90), SQL_SHAPE);
  const gap = minutesBetween(parseTime(minutesAgo(60))!, new Date());
  assert.ok(gap >= 59 && gap <= 61, `expected ~60 minutes, got ${gap}`);
});

test("addMinutes moves forward and backward without mutating the input", () => {
  const base = new Date("2026-03-05T10:00:00Z");
  assert.equal(addMinutes(base, 45).toISOString(), "2026-03-05T10:45:00.000Z");
  assert.equal(addMinutes(base, -75).toISOString(), "2026-03-05T08:45:00.000Z");
  assert.equal(base.toISOString(), "2026-03-05T10:00:00.000Z");
});

test("parseTime treats space separated stamps as UTC", () => {
  const parsed = parseTime("2026-03-05 14:07:09");
  assert.equal(parsed?.toISOString(), "2026-03-05T14:07:09.000Z");
});

test("parseTime passes ISO strings through and rejects junk", () => {
  assert.equal(parseTime("2026-03-05T14:07:09Z")?.toISOString(), "2026-03-05T14:07:09.000Z");
  assert.equal(parseTime(null), null);
  assert.equal(parseTime(undefined), null);
  assert.equal(parseTime(""), null);
  assert.equal(parseTime("not a date"), null);
});

test("parseTime round trips toSqlTime", () => {
  const now = new Date("2026-09-04T06:30:00Z");
  assert.equal(parseTime(toSqlTime(now))?.getTime(), now.getTime());
});

test("minutesBetween rounds to whole minutes and signs the direction", () => {
  const from = new Date("2026-03-05T10:00:00Z");
  assert.equal(minutesBetween(from, new Date("2026-03-05T10:30:00Z")), 30);
  assert.equal(minutesBetween(new Date("2026-03-05T10:30:00Z"), from), -30);
  assert.equal(minutesBetween(from, new Date("2026-03-05T10:00:20Z")), 0);
  assert.equal(minutesBetween(from, new Date("2026-03-05T10:00:40Z")), 1);
});

test("dayKey takes the date half of a stamp", () => {
  assert.equal(dayKey("2026-03-05 14:07:09"), "2026-03-05");
  assert.equal(dayKey(null), "");
});

test("formatSpan escalates minutes to hours to days", () => {
  assert.equal(formatSpan(0), "0m");
  assert.equal(formatSpan(59), "59m");
  assert.equal(formatSpan(60), "1h");
  assert.equal(formatSpan(95), "1h 35m");
  assert.equal(formatSpan(1440), "1d");
  assert.equal(formatSpan(1500), "1d 1h");
  assert.equal(formatSpan(-30), "0m");
});

test("timeAgo buckets recent stamps and falls back for old ones", () => {
  assert.equal(timeAgo(null), "—");
  assert.equal(timeAgo(minutesAgo(0)), "just now");
  assert.equal(timeAgo(minutesAgo(15)), "15m ago");
  assert.equal(timeAgo(minutesAgo(200)), "3h ago");
  assert.equal(timeAgo(minutesAgo(60 * 24 * 3)), "3d ago");
  assert.doesNotMatch(timeAgo(minutesAgo(60 * 24 * 400)), /ago$/);
});
