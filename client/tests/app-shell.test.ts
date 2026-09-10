import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const webRoot = process.cwd();
const repositoryRoot = resolve(webRoot, "..");
const readWeb = (path: string) => readFileSync(join(webRoot, path), "utf8");

test("the root layout uses CSS-defined system font fallbacks", () => {
  const layout = readWeb("src/app/layout.tsx");
  const css = readWeb("src/app/globals.css");

  assert.doesNotMatch(layout, /next\/font\/google/);
  assert.doesNotMatch(layout, /\bInter\b|\bSpace_Grotesk\b/);
  assert.match(css, /--font-inter:\s*ui-sans-serif/);
  assert.match(css, /--font-display:\s*var\(--font-inter\)/);
});

test("the sidebar exposes an accessible responsive mobile drawer", () => {
  const sidebar = readWeb("src/components/Sidebar.tsx");

  assert.match(sidebar, /aria-label="Open navigation menu"/);
  assert.match(sidebar, /aria-label="Close navigation menu"/);
  assert.match(sidebar, /aria-expanded=\{isOpen\}/);
  assert.match(sidebar, /md:hidden/);
  assert.match(sidebar, /fixed inset-y-0 left-0 z-50/);
  assert.match(sidebar, /onClick=\{\(\) => setIsOpen\(false\)\}/);
});

test("the app shell includes a dedicated operations top bar", () => {
  const layout = readWeb("src/app/(app)/layout.tsx");
  assert.match(layout, /import \{ AppTopbar \} from "@\/components\/AppTopbar"/);
  assert.match(layout, /<AppTopbar user=\{session\} \/>/);
});

test("CI installs and verifies client and server independently", () => {
  const ciPath = join(repositoryRoot, ".github/workflows/ci.yml");
  const workflow = readFileSync(ciPath, "utf8");

  assert.ok(existsSync(ciPath), "expected CI workflow");
  assert.ok(existsSync(join(webRoot, "eslint.config.mjs")), "expected client ESLint config");
  assert.ok(existsSync(join(repositoryRoot, "server/package.json")), "expected server package");
  assert.match(workflow, /JWT_SECRET: cleanops-ci-only-secret-at-least-32-characters/);
  assert.match(workflow, /working-directory: client/);
  assert.match(workflow, /working-directory: server/);
  assert.match(workflow, /cache-dependency-path: client\/package-lock\.json/);
  assert.match(workflow, /cache-dependency-path: server\/package-lock\.json/);
  for (const command of ["npm ci", "npm run lint", "npm run typecheck", "npm test", "npm run build"]) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
