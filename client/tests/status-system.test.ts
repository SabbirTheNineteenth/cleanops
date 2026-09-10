import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync("src/components/ui.tsx", "utf8");
const list = readFileSync("src/components/list.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

test("status badges use a shared semantic visual system", () => {
  assert.match(ui, /status-badge/);
  assert.match(ui, /status-dot/);
  assert.match(ui, /sla-badge/);
  assert.match(css, /html\.dark \.status-badge/);
  assert.match(css, /html\.dark \.data-table thead/);
  assert.match(css, /html\.dark \.list-toolbar/);
  assert.match(css, /\.table-scroll-hint/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.doesNotMatch(css, /\.table-scroll-shell::after/);
  assert.match(css, /html\.dark \.sla-badge/);
  assert.match(css, /\.dashboard-watch-meta/);
  assert.match(ui, /whitespace-nowrap/);
});

test("shared data tables provide a mobile scroll affordance", () => {
  assert.match(list, /table-scroll-shell/);
  assert.match(list, /Swipe to view details/);
});
