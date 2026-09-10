import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const list = readFileSync("src/components/list.tsx", "utf8");
const incidents = readFileSync("src/app/(app)/incidents/page.tsx", "utf8");
const sites = readFileSync("src/app/(app)/sites/page.tsx", "utf8");
const workers = readFileSync("src/app/(app)/workers/page.tsx", "utf8");
const notifications = readFileSync("src/app/(app)/notifications/page.tsx", "utf8");
const audit = readFileSync("src/app/(app)/audit/page.tsx", "utf8");
const members = readFileSync("src/app/(app)/members/page.tsx", "utf8");

test("operational list surfaces expose concise live context instead of generic empty chrome", () => {
  assert.match(list, /export function ListContext/);
  assert.match(list, /data-surface/);
  for (const source of [incidents, sites, workers, notifications, audit, members]) {
    assert.match(source, /ListContext/);
  }
});
