import { Hono } from "hono";
import { authRoutes } from "./routes/auth";
import { siteRoutes } from "./routes/sites";
import { workerRoutes } from "./routes/workers";
import { assignmentRoutes } from "./routes/assignments";
import { incidentRoutes } from "./routes/incidents";
import { statsRoutes } from "./routes/stats";
import { userRoutes } from "./routes/users";
import type { Variables } from "./middleware";

export const app = new Hono<{ Variables: Variables }>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, service: "cleanops" }));

app.route("/auth", authRoutes);
app.route("/sites", siteRoutes);
app.route("/workers", workerRoutes);
app.route("/assignments", assignmentRoutes);
app.route("/incidents", incidentRoutes);
app.route("/stats", statsRoutes);
app.route("/users", userRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("[api] error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export type AppType = typeof app;
