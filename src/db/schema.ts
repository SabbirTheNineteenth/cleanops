import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  status: text("status", { enum: ["active", "banned", "pending"] })
    .notNull()
    .default("active"),
  emailVerifiedAt: text("email_verified_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const sites = sqliteTable("sites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  location: text("location").notNull().default(""),
  status: text("status", { enum: ["active", "inactive"] })
    .notNull()
    .default("active"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const workers = sqliteTable("workers", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  userId: integer("user_id")
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().default(""),
  role: text("role").notNull().default("Field Technician"),
  status: text("status", { enum: ["available", "assigned", "off"] })
    .notNull()
    .default("available"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const assignments = sqliteTable("assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  siteId: integer("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  workerId: integer("worker_id")
    .notNull()
    .references(() => workers.id, { onDelete: "cascade" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  assignedAt: text("assigned_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  unassignedAt: text("unassigned_at"),
});

export const incidents = sqliteTable("incidents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("general"),
  siteId: integer("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  reportedBy: integer("reported_by")
    .notNull()
    .references(() => users.id),
  assignedTo: integer("assigned_to").references(() => workers.id, {
    onDelete: "set null",
  }),
  status: text("status", {
    enum: ["open", "assigned", "in_progress", "resolved"],
  })
    .notNull()
    .default("open"),
  severity: text("severity", {
    enum: ["low", "medium", "high", "critical"],
  })
    .notNull()
    .default("medium"),

  aiSummary: text("ai_summary"),
  aiSeverity: text("ai_severity", {
    enum: ["low", "medium", "high", "critical"],
  }),
  aiSuggestedAction: text("ai_suggested_action"),
  aiRecommendedRole: text("ai_recommended_role"),
  aiResponseWindow: text("ai_response_window"),
  aiSource: text("ai_source", { enum: ["openrouter", "heuristic"] }),
  resolutionNote: text("resolution_note"),
  dueAt: text("due_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  resolvedAt: text("resolved_at"),
});

export const incidentComments = sqliteTable("incident_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  incidentId: integer("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  authorId: integer("author_id").references(() => users.id, {
    onDelete: "set null",
  }),
  authorName: text("author_name").notNull().default("Unknown"),
  body: text("body").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const incidentEvents = sqliteTable("incident_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  incidentId: integer("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  actorName: text("actor_name").notNull().default("System"),
  type: text("type").notNull(),
  message: text("message").notNull(),
  fromValue: text("from_value"),
  toValue: text("to_value"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const incidentTasks = sqliteTable("incident_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  incidentId: integer("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  doneBy: integer("done_by").references(() => users.id, {
    onDelete: "set null",
  }),
  doneAt: text("done_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("info"),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  link: text("link"),
  readAt: text("read_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorId: integer("actor_id").references(() => users.id, {
    onDelete: "set null",
  }),
  actorEmail: text("actor_email").notNull().default("system"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  detail: text("detail").notNull().default(""),
  ip: text("ip").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  userAgent: text("user_agent").notNull().default(""),
  ip: text("ip").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  lastSeenAt: text("last_seen_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
});

export const authAttempts = sqliteTable("auth_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  email: text("email").notNull().default(""),
  ip: text("ip").notNull().default(""),
  success: integer("success", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const emailTokens = sqliteTable("email_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: text("purpose").notNull().default("verify_email"),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;
export type Assignment = typeof assignments.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;
export type IncidentComment = typeof incidentComments.$inferSelect;
export type IncidentEvent = typeof incidentEvents.$inferSelect;
export type IncidentTask = typeof incidentTasks.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
