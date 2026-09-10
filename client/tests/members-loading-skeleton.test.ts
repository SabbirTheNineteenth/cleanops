import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const members = readFileSync("src/app/(app)/members/page.tsx", "utf8");

test("Members renders the shared list skeleton while its initial list request is loading", () => {
  assert.match(members, /ListLoadingSkeleton/);
  assert.match(members, /list\.loading\s*&&\s*list\.rows\.length\s*===\s*0/);
  assert.match(
    members,
    /\{list\.loading\s*&&\s*list\.rows\.length\s*===\s*0\s*&&\s*<ListLoadingSkeleton(?:\s+rows=\{\d+\})?\s*\/>\}/,
  );
});
