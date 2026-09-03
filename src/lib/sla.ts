import { addMinutes, formatSpan, minutesBetween, parseTime, toSqlTime } from "./time";

export type Severity = "low" | "medium" | "high" | "critical";

export type SlaState =
  | "none"
  | "on_track"
  | "due_soon"
  | "overdue"
  | "met"
  | "breached";

export const SLA_MINUTES: Record<Severity, number> = {
  critical: 60,
  high: 240,
  medium: 1440,
  low: 4320,
};

const WINDOW_MINUTES: Record<string, number> = {
  immediate: 30,
  "within 1 hour": 60,
  "same day": 480,
  "next scheduled visit": 2880,
};

export function slaMinutes(
  severity: string | null | undefined,
  responseWindow?: string | null,
): number {
  const fromWindow = WINDOW_MINUTES[String(responseWindow ?? "").trim().toLowerCase()];
  if (fromWindow) return fromWindow;
  return SLA_MINUTES[(severity ?? "medium") as Severity] ?? SLA_MINUTES.medium;
}

export function computeDueAt(
  severity: string | null | undefined,
  responseWindow?: string | null,
  from: Date = new Date(),
): string {
  return toSqlTime(addMinutes(from, slaMinutes(severity, responseWindow)));
}

export interface SlaSubject {
  status: string;
  severity?: string | null;
  dueAt?: string | null;
  resolvedAt?: string | null;
  aiResponseWindow?: string | null;
}

export interface SlaInfo {
  state: SlaState;
  dueAt: string | null;
  minutesLeft: number | null;
  overdue: boolean;
  label: string;
  tone: "neutral" | "good" | "warn" | "bad";
}

export function slaInfo(subject: SlaSubject, now: Date = new Date()): SlaInfo {
  const due = parseTime(subject.dueAt);
  if (!due) {
    return {
      state: "none",
      dueAt: null,
      minutesLeft: null,
      overdue: false,
      label: "No SLA",
      tone: "neutral",
    };
  }

  const dueAt = subject.dueAt ?? null;

  if (subject.status === "resolved") {
    const resolved = parseTime(subject.resolvedAt) ?? now;
    const met = resolved.getTime() <= due.getTime();
    return {
      state: met ? "met" : "breached",
      dueAt,
      minutesLeft: minutesBetween(resolved, due),
      overdue: !met,
      label: met ? "Met SLA" : `Missed SLA by ${formatSpan(minutesBetween(due, resolved))}`,
      tone: met ? "good" : "bad",
    };
  }

  const left = minutesBetween(now, due);
  if (left < 0) {
    return {
      state: "overdue",
      dueAt,
      minutesLeft: left,
      overdue: true,
      label: `Overdue by ${formatSpan(-left)}`,
      tone: "bad",
    };
  }

  const budget = slaMinutes(subject.severity, subject.aiResponseWindow);
  const soonThreshold = Math.max(15, Math.round(budget * 0.25));
  return {
    state: left <= soonThreshold ? "due_soon" : "on_track",
    dueAt,
    minutesLeft: left,
    overdue: false,
    label: `Due in ${formatSpan(left)}`,
    tone: left <= soonThreshold ? "warn" : "neutral",
  };
}

export const SLA_STATE_LABEL: Record<SlaState, string> = {
  none: "No SLA",
  on_track: "On track",
  due_soon: "Due soon",
  overdue: "Overdue",
  met: "Met",
  breached: "Breached",
};
