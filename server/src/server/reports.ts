import { formatSpan } from "@/lib/time";

export interface ReportTally {
  total: number;
  open: number;
  resolved: number;
  urgent: number;
  overdue: number;
  breached: number;
  met: number;
  avgMinutes: number;
}

type ReportTallyAggregate = { [K in keyof ReportTally]: unknown };

function reportNumber(value: unknown, digits = 0): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

export function normalizeReportTally(row: Partial<ReportTallyAggregate> | null | undefined): ReportTally {
  return {
    total: reportNumber(row?.total),
    open: reportNumber(row?.open),
    resolved: reportNumber(row?.resolved),
    urgent: reportNumber(row?.urgent),
    overdue: reportNumber(row?.overdue),
    breached: reportNumber(row?.breached),
    met: reportNumber(row?.met),
    avgMinutes: reportNumber(row?.avgMinutes),
  };
}

export function addSlaRate<T extends ReportTally>(row: T) {
  const judged = row.met + row.breached;
  return {
    ...row,
    slaRate: judged ? Math.round((row.met / judged) * 100) : null,
    avgResolution: row.avgMinutes ? formatSpan(Math.round(row.avgMinutes)) : "—",
  };
}

export function reportCount(value: unknown): number {
  return reportNumber(value);
}
