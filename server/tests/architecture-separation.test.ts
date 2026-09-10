import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(process.cwd(), "..");
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

test("the repository keeps client and server as self-contained application roots", () => {
  assert.ok(existsSync(join(root, "client/package.json")));
  assert.ok(existsSync(join(root, "server/package.json")));
  assert.equal(existsSync(join(root, "package.json")), false);
  assert.equal(existsSync(join(root, "packages")), false);
  assert.equal(existsSync(join(root, "frontend")), false);
  assert.equal(existsSync(join(root, "backend")), false);
});

test("the client has no direct imports of server or database implementation", () => {
  for (const source of [read("client/src/app/(app)/layout.tsx"), read("client/src/app/(app)/dashboard/page.tsx")]) {
    assert.doesNotMatch(source, /@\/server|@\/db|@\/lib\/session/);
  }
});

test("the server configures an explicit browser-origin allowlist for credentialed requests", () => {
  const app = read("server/src/server/app.ts");
  const originResolver = read("server/src/server/origins.ts");
  assert.match(app, /cors\(/);
  assert.match(app, /resolveAllowedWebOrigins/);
  assert.match(originResolver, /WEB_ORIGIN/);
  assert.match(originResolver, /WEB_ORIGINS/);
  assert.match(originResolver, /HTTPS/);
  assert.match(app, /credentials:\s*true/);
  assert.ok(
    app.indexOf('app.get("/health"') < app.indexOf('cors({'),
    "health must be registered before CORS validates browser origins",
  );
});

test("the server has a compiled production build and does not use tsx at runtime", () => {
  const serverPackage = JSON.parse(read("server/package.json")) as { scripts?: Record<string, string> };

  assert.ok(existsSync(join(root, "server/tsconfig.build.json")));
  assert.match(serverPackage.scripts?.build ?? "", /tsc/);
  assert.match(serverPackage.scripts?.start ?? "", /^node dist\/index\.js$/);
  assert.doesNotMatch(serverPackage.scripts?.start ?? "", /tsx/);
});

test("the server exposes a zero-config Hono Vercel entrypoint and owns its environment file", () => {
  const config = read("server/vercel.json");
  const entrypoint = read("server/src/index.ts");

  assert.match(config, /"framework": "hono"/);
  assert.match(entrypoint, /export default app/);
  assert.match(entrypoint, /dotenv\/config/);
});
