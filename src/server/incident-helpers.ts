import { parseTime, toSqlTime } from "@/lib/time";
import type { IncidentStatus } from "./workflow";

export function requestedIncidentStatus(
  status: IncidentStatus | undefined,
  assignedTo: number | null | undefined,
  existingStatus: string,
): IncidentStatus | undefined {
  return status ?? (assignedTo !== undefined && assignedTo !== null && existingStatus === "open" ? "assigned" : undefined);
}

export function toIncidentDueAt(value: string | null): string | null | undefined {
  if (value === null || value === "") return null;
  const parsed = parseTime(value);
  return parsed ? toSqlTime(parsed) : undefined;
}
