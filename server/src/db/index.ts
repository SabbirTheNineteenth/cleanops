import { createHash } from "node:crypto";
import clientRuntime from "./client-runtime.cjs";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { databaseClientConfig } from "./config";

const { createClient } = clientRuntime;
const { url, authToken } = databaseClientConfig();

if (process.env.VERCEL === "1") {
  const fingerprint = createHash("sha256").update(`${url}\u0000${authToken ?? ""}`).digest("hex").slice(0, 16);
  console.info(JSON.stringify({ category: "database.config", fingerprint }));
}

const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof createClient>;
};

export const client =
  globalForDb.client ?? createClient({ url, authToken });

if (process.env.NODE_ENV !== "production") {
  globalForDb.client = client;
}

export const db = drizzle(client, { schema });
export { schema };
