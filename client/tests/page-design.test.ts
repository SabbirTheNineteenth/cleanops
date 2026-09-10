import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const header = readFileSync("src/components/PageHeader.tsx", "utf8");

test("authenticated page headers use section-specific premium hero treatments", () => {
  assert.match(header, /const PAGE_THEMES/);
  assert.match(header, /Operations:/);
  assert.match(header, /Administration:/);
  assert.match(header, /Compliance:/);
  assert.match(header, /overflow-hidden rounded-2xl/);
  assert.match(header, /aria-hidden="true"/);
});

test("protected routes retain their deliberate page shell, hero, or dashboard monitor", () => {
  const appRoot = "src/app/(app)";
  for (const path of [
    "account/page.tsx", "audit/page.tsx", "incidents/page.tsx", "members/page.tsx",
    "notifications/page.tsx", "reports/page.tsx", "sites/page.tsx", "workers/page.tsx",
  ]) {
    assert.match(readFileSync(`${appRoot}/${path}`, "utf8"), /PageHeader/);
  }
  assert.match(readFileSync("src/components/dashboard/DashboardClient.tsx", "utf8"), /dashboard-monitor/);
  for (const path of ["incidents/[id]/page.tsx", "sites/[id]/page.tsx"]) {
    assert.match(readFileSync(`${appRoot}/${path}`, "utf8"), /DetailHero/);
  }
});
