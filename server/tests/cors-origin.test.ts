import assert from "node:assert/strict";
import test from "node:test";
import { resolveAllowedWebOrigins } from "../src/server/origins";

test("CORS accepts only explicitly configured web origins", () => {
  assert.deepEqual(
    resolveAllowedWebOrigins({ WEB_ORIGINS: "https://app.example.com, https://staging.example.com" }, "production"),
    ["https://app.example.com", "https://staging.example.com"],
  );
});

test("production CORS rejects missing, insecure, wildcard, and path origins", () => {
  assert.throws(() => resolveAllowedWebOrigins({}, "production"), /WEB_ORIGIN/);
  assert.throws(() => resolveAllowedWebOrigins({ WEB_ORIGIN: "http://app.example.com" }, "production"), /HTTPS/);
  assert.throws(() => resolveAllowedWebOrigins({ WEB_ORIGIN: "https://*.example.com" }, "production"), /wildcard/);
  assert.throws(() => resolveAllowedWebOrigins({ WEB_ORIGIN: "https://app.example.com/path" }, "production"), /origin/);
});
