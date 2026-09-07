import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("the root layout uses CSS-defined system font fallbacks", () => {
  const layout = read("src/app/layout.tsx");
  const css = read("src/app/globals.css");

  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.doesNotMatch(layout, /\bInter\b|\bSpace_Grotesk\b/);
  assert.match(css, /--font-inter:\s*ui-sans-serif/);
  assert.match(css, /--font-display:\s*var\(--font-inter\)/);
});

test("the sidebar exposes an accessible responsive mobile drawer", () => {
  const sidebar = read("src/components/Sidebar.tsx");

  assert.match(sidebar, /aria-label="Open navigation menu"/);
  assert.match(sidebar, /aria-label="Close navigation menu"/);
  assert.match(sidebar, /aria-expanded=\{isOpen\}/);
  assert.match(sidebar, /md:hidden/);
  assert.match(sidebar, /fixed inset-y-0 left-0 z-50/);
  assert.match(sidebar, /onClick=\{\(\) => setIsOpen\(false\)\}/);
});

test("lint is deterministic and CI runs lint, typecheck, tests, and build", () => {
  const packageJson = read("package.json");
  const workflowPath = ".github/workflows/ci.yml";

  assert.match(packageJson, /"lint":\s*"eslint \./);
  assert.ok(existsSync(join(root, "eslint.config.mjs")), "expected flat ESLint config");
  assert.ok(existsSync(join(root, workflowPath)), "expected CI workflow");

  const config = read("eslint.config.mjs");
  const workflow = read(workflowPath);
  assert.match(config, /globalIgnores/);
  for (const command of ["npm ci", "npm run lint", "npm run typecheck", "npm test", "npm run build"]) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
