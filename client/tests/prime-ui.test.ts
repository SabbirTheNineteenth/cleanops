import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
const topbar = readFileSync("src/components/AppTopbar.tsx", "utf8");
const list = readFileSync("src/components/list.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const workspaceSearch = readFileSync("src/components/WorkspaceSearch.tsx", "utf8");
const dashboard = readFileSync("src/components/dashboard/DashboardClient.tsx", "utf8");

test("prime workspace establishes premium navigation and content surfaces", () => {
  assert.match(sidebar, /workspace-rail/);
  assert.match(sidebar, /Operational command/);
  assert.match(topbar, /workspace-status/);
  assert.match(topbar, /WorkspaceSearch/);
  assert.match(topbar, /Live workspace/);
  assert.match(list, /list-toolbar/);
  assert.match(globals, /\.workspace-rail/);
  assert.match(globals, /\.list-toolbar/);
  assert.match(workspaceSearch, /trapFocus/);
  assert.match(workspaceSearch, /aria-label="Search workspace destinations"/);
  assert.match(workspaceSearch, /aria-live="polite"/);
  assert.match(dashboard, /dark:text-red-300/);
  assert.match(dashboard, /dark:text-amber-300/);
  assert.match(globals, /html\.dark \.workspace-search-trigger/);
  assert.match(globals, /html\.dark \.workspace-search-panel \.text-ink-900/);
  assert.match(globals, /html\.dark \.workspace-search-panel \.text-ink-500/);
});
