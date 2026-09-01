import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),

});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const adminCreateUserSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["admin", "user"]).optional().default("user"),
});

export const siteSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  location: z.string().optional().default(""),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

export const workerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().default(""),
  role: z.string().optional().default("Field Technician"),
  status: z.enum(["available", "assigned", "off"]).optional().default("available"),
});

export const assignmentSchema = z.object({
  siteId: z.number().int().positive(),
  workerId: z.number().int().positive(),
});

export const incidentSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional().default(""),
  category: z.string().optional().default("general"),
  siteId: z.number().int().positive(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
});

export const incidentUpdateSchema = z.object({
  status: z.enum(["open", "assigned", "in_progress", "resolved"]).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  assignedTo: z.number().int().positive().nullable().optional(),
  resolutionNote: z.string().optional(),
});

export const incidentWorkSchema = z.object({
  status: z.enum(["in_progress", "resolved"]).optional(),
  resolutionNote: z.string().optional(),
});

export const enhanceTextSchema = z.object({
  text: z.string().min(3, "Write a few words first"),
  title: z.string().optional().default(""),
  category: z.string().optional().default(""),
  siteName: z.string().optional().default(""),
});

export type SiteInput = z.infer<typeof siteSchema>;
export type WorkerInput = z.infer<typeof workerSchema>;
export type IncidentInput = z.infer<typeof incidentSchema>;
