import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const useList = readFileSync("src/lib/useList.ts", "utf8");
const reports = readFileSync("src/app/(app)/reports/page.tsx", "utf8");

test("CSV exports use the configured backend API origin, never a client-relative /api URL", () => {
  assert.match(useList, /resolveApiUrl\(`\$\{path\}\?\$\{buildQuery\(\{ format: \"csv\" \}\)\}`\)/);
  assert.match(reports, /resolveApiUrl\(`\/reports\/\$\{tab\}\?\$\{query\}&format=csv`\)/);
  assert.doesNotMatch(useList, /exportUrl:\s*`\/api\$\{path\}/);
  assert.doesNotMatch(reports, /:\s*`\/api\/reports\//);
});
