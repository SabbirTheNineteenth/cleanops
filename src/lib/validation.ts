import { z } from "zod";

const PASSWORD_MESSAGE =
  "Use at least 8 characters with an uppercase letter, a lowercase letter and a number";

export const strongPassword = z
  .string()
  .min(8, PASSWORD_MESSAGE)
  .max(72, "Password is too long")
  .regex(/[a-z]/, PASSWORD_MESSAGE)
  .regex(/[A-Z]/, PASSWORD_MESSAGE)
  .regex(/[0-9]/, PASSWORD_MESSAGE);

export const registerSchema = z.object({
  name: z.string().min(2, "Name is too short").max(80),
  email: z.string().email().max(160),
  password: strongPassword,
});

export const loginSchema = z.object({
  email: z.string().email().max(160),
  password: z.string().min(1).max(72),
});

export const adminCreateUserSchema = z.object({
  name: z.string().min(2, "Name is too short").max(80),
  email: z.string().email().max(160),
  password: strongPassword,
  role: z.enum(["admin", "user"]).optional().default("user"),
});

export const userUpdateSchema = z.object({
  status: z.enum(["active", "banned", "pending"]).optional(),
  role: z.enum(["admin", "user"]).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(72),
  newPassword: strongPassword,
});

export const resetPasswordSchema = z.object({
  password: strongPassword,
});

export const profileSchema = z.object({
  name: z.string().min(2, "Name is too short").max(80),
  phone: z.string().max(40).optional().default(""),
});

export const siteSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(40),
  location: z.string().max(160).optional().default(""),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

export const workerSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(160),
  phone: z.string().max(40).optional().default(""),
  role: z.string().max(60).optional().default("Field Technician"),
  status: z.enum(["available", "assigned", "off"]).optional().default("available"),
});

export const assignmentSchema = z.object({
  siteId: z.number().int().positive(),
  workerId: z.number().int().positive(),
});

export const incidentSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().max(4000).optional().default(""),
  category: z.string().max(60).optional().default("general"),
  siteId: z.number().int().positive(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
});

export const incidentUpdateSchema = z.object({
  status: z.enum(["open", "assigned", "in_progress", "resolved"]).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  assignedTo: z.number().int().positive().nullable().optional(),
  resolutionNote: z.string().max(2000).optional(),
  dueAt: z.string().max(40).nullable().optional(),
});

export const incidentWorkSchema = z.object({
  status: z.enum(["in_progress", "resolved"]).optional(),
  resolutionNote: z.string().max(2000).optional(),
});

export const commentSchema = z.object({
  body: z.string().min(2, "Write a comment first").max(2000),
});

export const taskSchema = z.object({
  title: z.string().min(2, "Give the task a title").max(160),
});

export const taskUpdateSchema = z.object({
  done: z.boolean(),
});

export const enhanceTextSchema = z.object({
  text: z.string().min(3, "Write a few words first").max(4000),
  mode: z.enum(["style", "translate", "fix"]).optional().default("style"),
  preset: z
    .enum(["formal", "short", "detailed", "corporate", "simple", "urgent"])
    .optional()
    .default("formal"),
  language: z
    .enum(["english", "bangla", "hindi", "arabic"])
    .optional()
    .default("english"),
  title: z.string().max(160).optional().default(""),
  category: z.string().max(60).optional().default(""),
  siteName: z.string().max(120).optional().default(""),
});

export type SiteInput = z.infer<typeof siteSchema>;
export type WorkerInput = z.infer<typeof workerSchema>;
export type IncidentInput = z.infer<typeof incidentSchema>;
