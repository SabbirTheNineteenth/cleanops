export interface Tally {
  total: number;
  open: number;
  resolved: number;
  urgent: number;
  overdue: number;
  breached: number;
  met: number;
  slaRate: number | null;
  avgResolution: string;
}

export interface RangeInfo {
  from: string;
  to: string;
  days: number;
}

export interface Overview {
  range: RangeInfo;
  summary: Tally;
  byStatus: { key: string; total: number }[];
  bySeverity: { key: string; total: number }[];
  trend: { day: string; total: number; resolved: number }[];
  topSites: { siteId: number; name: string; code: string; total: number }[];
}

export interface SiteRow extends Tally {
  siteId: number;
  name: string;
  code: string;
  location: string;
  status: string;
}

export interface WorkerRow extends Tally {
  workerId: number;
  name: string;
  role: string;
  status: string;
}

export interface CategoryRow extends Tally {
  category: string;
}

export interface SlaRow {
  id: number;
  title: string;
  severity: string;
  status: string;
  dueAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  siteName: string | null;
  workerName: string | null;
  sla: { label: string; tone: string; state: string };
}

export interface SlaReport {
  range: RangeInfo;
  summary: Tally;
  breaches: SlaRow[];
  atRisk: SlaRow[];
}

export interface TallyRow extends Tally {
  key: string;
  label: string;
  sub: string;
  href?: string;
}

export type ReportTableTab = "sites" | "workers" | "categories";

export function dayStampAt(now: Date, offsetDays = 0): string {
  const date = new Date(now);
  date.setDate(date.getDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

export function reportSearchParams(from: string, to: string): string {
  return `from=${from}&to=${to}`;
}

export function reportRowsFor(tab: "sites", rows: SiteRow[]): TallyRow[];
export function reportRowsFor(tab: "workers", rows: WorkerRow[]): TallyRow[];
export function reportRowsFor(tab: "categories", rows: CategoryRow[]): TallyRow[];
export function reportRowsFor(tab: ReportTableTab, rows: (SiteRow | WorkerRow | CategoryRow)[]): TallyRow[] {
  if (tab === "sites") {
    return (rows as SiteRow[]).map((row) => ({
      ...row,
      key: `site-${row.siteId}`,
      label: row.name,
      sub: [row.code, row.location].filter(Boolean).join(" · "),
      href: `/sites/${row.siteId}`,
    }));
  }
  if (tab === "workers") {
    return (rows as WorkerRow[]).map((row) => ({
      ...row,
      key: `worker-${row.workerId}`,
      label: row.name,
      sub: `${row.role} · ${row.status}`,
    }));
  }
  return (rows as CategoryRow[]).map((row) => ({ ...row, key: `cat-${row.category}`, label: row.category, sub: "" }));
}
