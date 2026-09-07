export type IncidentStatus = "open" | "assigned" | "in_progress" | "resolved";

export interface TransitionContext {
  assignedTo?: number | null;
  resolutionNote?: string | null;
}

export type TransitionResult = { ok: true } | { ok: false; error: string };

const NEXT: Record<IncidentStatus, IncidentStatus | null> = {
  open: "assigned",
  assigned: "in_progress",
  in_progress: "resolved",
  resolved: null,
};

export function validateIncidentTransition(
  current: IncidentStatus,
  next: IncidentStatus,
  context: TransitionContext,
): TransitionResult {
  if (current === next) return { ok: true };
  if (NEXT[current] !== next) {
    return { ok: false, error: `An incident cannot move from ${current} to ${next}` };
  }
  if ((next === "assigned" || next === "in_progress" || next === "resolved") && !context.assignedTo) {
    return { ok: false, error: "An assignee is required before work can start" };
  }
  if (next === "resolved" && !context.resolutionNote?.trim()) {
    return { ok: false, error: "A resolution note is required before resolving an incident" };
  }
  return { ok: true };
}