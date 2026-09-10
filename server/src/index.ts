import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./server/app";

export default app;

if (process.env.VERCEL !== "1") {
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port });
  console.info(`CleanOps API listening on http://localhost:${port}`);
}
