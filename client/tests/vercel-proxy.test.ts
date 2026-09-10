import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nextConfig = readFileSync("next.config.ts", "utf8");
const clientEnv = readFileSync(".env.example", "utf8");

test("the client proxies browser API requests through its own origin", () => {
  assert.match(nextConfig, /async rewrites\(\)/);
  assert.match(nextConfig, /source:\s*"\/api\/:path\*"/);
  assert.match(nextConfig, /CLEANOPS_API_INTERNAL_URL/);
  assert.match(clientEnv, /NEXT_PUBLIC_API_URL=\/api/);
});
