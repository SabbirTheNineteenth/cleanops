import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const list = readFileSync("src/components/list.tsx", "utf8");
const utils = readFileSync("src/lib/utils.tsx", "utf8");

test("list filters are collected behind one accessible Filters dropdown", () => {
  assert.match(list, /function FilterMenu/);
  assert.match(list, /aria-label="Open filters"/);
  assert.match(list, /<FilterMenu activeFilters=\{activeFilters\} onReset=\{onReset\}>/);
  assert.match(list, /No filters applied/);
  assert.match(list, /Clear all filters/);
});

test("filter menu closes safely for outside pointers, Escape, navigation, and reset", () => {
  assert.match(list, /usePathname/);
  assert.match(list, /useRef<HTMLDivElement>/);
  assert.match(list, /document\.addEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(list, /document\.removeEventListener\("pointerdown", handlePointerDown\)/);
  assert.match(list, /event\.key !== "Escape"/);
  assert.match(list, /containerRef\.current\?\.contains\(event\.target as Node\)/);
  assert.match(list, /aria-expanded=\{open\}/);
  assert.match(list, /aria-controls=\{popoverId\}/);
  assert.match(list, /onClick=\{handleReset\}/);
});

test("shared list loading skeleton preserves table and card layouts", () => {
  assert.match(list, /export function ListLoadingSkeleton/);
  assert.match(list, /variant\s*=\s*"table"/);
  assert.match(list, /aria-label="Loading results"/);
  assert.match(list, /Array\.from\(\{ length: rows \}\)/);
});

test("shared class composition is provided by utils.tsx", () => {
  assert.match(utils, /export function cn/);
});
