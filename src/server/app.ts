import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { assertAuthConfiguration } from "@/lib/auth";
import { authRoutes } from "./routes/auth";
import { siteRoutes } from "./routes/sites";
import { workerRoutes } from "./routes/workers";
import { assignmentRoutes } from "./routes/assignments";
import { incidentRoutes } from "./routes/incidents";
import { collabRoutes } from "./routes/collab";
import { notificationRoutes } from "./routes/notifications";
import { auditRoutes } from "./routes/audit";
import { reportRoutes } from "./routes/reports";
import { statsRoutes } from "./routes/stats";
import { userRoutes } from "./routes/users";
import type { Variables } from "./middleware";
import { logBestEffortFailure } from "./logging";

assertAuthConfiguration();

export const app = new Hono<{ Variables: Variables }>().basePath("/api");

app.use("*", async (c, next) => {
  const requestId = c.req.header("x-request-id")?.slice(0, 80) || randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
});

app.get("/health", (c) => c.json({ ok: true, service: "cleanops" }));

app.route("/auth", authRoutes);
app.route("/sites", siteRoutes);
app.route("/workers", workerRoutes);
app.route("/assignments", assignmentRoutes);
app.route("/incidents", collabRoutes);
app.route("/incidents", incidentRoutes);
app.route("/notifications", notificationRoutes);
app.route("/audit", auditRoutes);
app.route("/reports", reportRoutes);
app.route("/stats", statsRoutes);
app.route("/users", userRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  const requestId = c.get("requestId");
  logBestEffortFailure("request.failed", err, { requestId, path: c.req.path });
  return c.json({ error: "Internal server error", requestId }, 500);
});

export type AppType = typeof app;
