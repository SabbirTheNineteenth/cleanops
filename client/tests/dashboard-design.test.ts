import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("src/components/dashboard/DashboardClient.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

test("dashboard is a focused operational monitor, not a stack of generic cards", () => {
  assert.match(dashboard, /dashboard-monitor/);
  assert.match(dashboard, /dashboard-health-strip/);
  assert.match(dashboard, /dashboard-primary-grid/);
  assert.match(dashboard, /dashboard-secondary-grid/);
  assert.match(dashboard, /dashboard-distribution/);
  assert.match(dashboard, /dashboard-watch-item/);
  assert.match(dashboard, /dashboard-watch-meta--attention/);
  assert.match(dashboard, /dashboard-watch-meta--recent/);
  assert.match(css, /\.dashboard-watch-meta--attention/);
  assert.match(css, /grid-template-columns: 10rem 5\.75rem 7\.25rem/);
  assert.match(css, /@media \(max-width: 640px\).*dashboard-watch-meta--attention/s);
  assert.match(dashboard, /self-start/);
  assert.doesNotMatch(dashboard, /PageHeader/);
  assert.doesNotMatch(dashboard, /PieChart/);
  assert.doesNotMatch(dashboard, /BarChart/);
  assert.doesNotMatch(dashboard, /absolute left-0 top-0 h-full w-1/);
});
