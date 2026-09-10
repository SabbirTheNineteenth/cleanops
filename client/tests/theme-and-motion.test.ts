import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toggle = readFileSync("src/components/ThemeToggle.tsx", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const config = readFileSync("tailwind.config.ts", "utf8");
const appLayout = readFileSync("src/app/(app)/layout.tsx", "utf8");
const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");

test("dark mode is persisted, avoids a theme flash, and remains user controllable", () => {
  assert.match(toggle, /try \{\s*localStorage\.setItem[\s\S]*?\} catch/);
  assert.match(toggle, /aria-label/);
  assert.match(toggle, /Moon/);
  assert.match(toggle, /Sun/);
  assert.match(layout, /cleanops-theme/);
  assert.match(globals, /html\.dark/);
  assert.match(config, /darkMode: "class"/);
  assert.match(appLayout, /bg-\[var\(--surface-canvas\)\]/);
  assert.match(sidebar, /ThemeToggle/);
});

test("motion enhancements respect reduced-motion preferences", () => {
  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(globals, /panel-enter/);
  assert.match(globals, /list-row-enter/);
});
