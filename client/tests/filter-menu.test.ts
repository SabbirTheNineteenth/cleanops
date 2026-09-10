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

test("shared class composition is provided by utils.tsx", () => {
  assert.match(utils, /export function cn/);
});
