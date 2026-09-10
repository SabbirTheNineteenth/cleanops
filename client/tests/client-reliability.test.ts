import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveApiOrigin, resolveApiUrl } from "../src/lib/api";

const read = (path: string) => readFileSync(path, "utf8");
const reports = read("src/app/(app)/reports/page.tsx");
const incidents = read("src/app/(app)/incidents/page.tsx");
const useList = read("src/lib/useList.ts");
const modal = read("src/components/Modal.tsx");
const sidebar = read("src/components/Sidebar.tsx");
const editor = read("src/components/ai/AIEditor.tsx");
const assign = read("src/components/admin/AssignWorkerModal.tsx");
const work = read("src/components/worker/MyWork.tsx");
const detail = read("src/app/(app)/incidents/[id]/page.tsx");
const reset = read("src/components/admin/ResetPasswordModal.tsx");
const account = read("src/app/(app)/account/page.tsx");


test("browser requests default to a safe same-origin API proxy and tolerate missing public config", () => {
  assert.equal(resolveApiOrigin(undefined), "/api");
  assert.equal(resolveApiUrl("auth/me", "/api/"), "/api/auth/me");
  assert.equal(resolveApiOrigin("https://api.example.test/api"), "https://api.example.test/api");
});

test("reports abort and clear previous data before a changed request can resolve", () => {
  assert.match(reports, /AbortController/);
  assert.match(reports, /load\(controller\.signal\)/);
  assert.match(reports, /setOverview\(null\)/);
  assert.match(reports, /setRows\(null\)/);
  assert.match(reports, /setSla\(null\)/);
  assert.match(reports, /controller\.abort\(\)/);
});

test("incident filters follow URL changes instead of retaining initial route filters", () => {
  assert.match(incidents, /useEffect\(\(\) => \{[\s\S]*searchParams\.get\("status"\)/);
  assert.match(useList, /type:\s*"replaceFilters"/);
  assert.match(useList, /setFiltersFromUrl/);
});

test("shared list failures clear stale rows and expose a retry action", () => {
  assert.match(useList, /setRows\(\[\]\)/);
  assert.match(useList, /setExtra\(null\)/);
  assert.match(useList, /refresh:/);
  assert.match(incidents, /list\.refresh/);
});

test("modal and mobile drawer use accessible dialog semantics and focus-safe controls", () => {
  assert.match(modal, /aria-label="Close dialog"/);
  assert.match(modal, /onMouseDown=\{\(event\) => \{[\s\S]*event\.target === event\.currentTarget/);
  assert.match(sidebar, /aria-modal="true"/);
  assert.match(sidebar, /role="dialog"/);
  assert.match(sidebar, /overflow-y-auto/);
});

test("AI editor exposes named controls and selected tabs", () => {
  assert.match(editor, /aria-expanded=\{open\}/);
  assert.match(editor, /aria-controls=/);
  assert.match(editor, /role="tablist"/);
  assert.match(editor, /aria-selected=/);
  assert.match(editor, /aria-label="Close AI editor"/);
});

test("assignment and work flows provide recoverable loading errors and pending controls", () => {
  assert.match(assign, /Promise\.all/);
  assert.match(assign, /Retry loading options/);
  assert.match(assign, /loadingOptions/);
  assert.match(work, /Could not load assigned work/);
  assert.match(work, /Retry/);
  assert.match(work, /disabled=\{saving\}/);
});

test("incident deletion has pending and error states rather than unhandled navigation", () => {
  assert.match(detail, /deleting/);
  assert.match(detail, /setError/);
  assert.match(detail, /disabled=\{busy \|\| deleting\}/);
});

test("passwords are masked until explicitly revealed, with deliberate clipboard affordance", () => {
  assert.match(reset, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(reset, /Copy password/);
  assert.match(reset, /navigator\.clipboard\.writeText/);
  assert.match(account, /type=\{showCurrentPassword \? "text" : "password"\}/);
  assert.match(account, /type=\{showNewPassword \? "text" : "password"\}/);
});
