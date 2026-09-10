export function toSqlTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function sqlNow(): string {
  return toSqlTime(new Date());
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function minutesAgo(minutes: number): string {
  return toSqlTime(addMinutes(new Date(), -minutes));
}

export function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

export function dayKey(value: string | null | undefined): string {
  return String(value ?? "").slice(0, 10);
}

export function formatSpan(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours < 24) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

export function formatWhen(value: string | null | undefined): string {
  const parsed = parseTime(value);
  if (!parsed) return "—";
  return parsed.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(value: string | null | undefined): string {
  const parsed = parseTime(value);
  if (!parsed) return "—";
  const mins = minutesBetween(parsed, new Date());
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  const days = Math.floor(mins / (60 * 24));
  if (days < 30) return `${days}d ago`;
  return formatWhen(value);
}
