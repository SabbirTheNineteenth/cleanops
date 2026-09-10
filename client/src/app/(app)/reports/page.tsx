"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  BarChart3,
  Building2,
  CalendarRange,
  Download,
  Gauge,
  Layers,
  ShieldAlert,
  Timer,
  Users,
} from "lucide-react";
import { getJSON, resolveApiUrl } from "@/lib/api";
import { formatWhen } from "@/lib/time";
import {
  Card,
  Select,
  SeverityBadge,
  Skeleton,
  SlaBadge,
  StatusBadge,
  Tone,
  SEVERITY_HEX,
} from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { TableShell } from "@/components/list";
import {
  dayStampAt,
  reportRowsFor,
  reportSearchParams,
  type CategoryRow,
  type Overview,
  type SiteRow,
  type SlaReport,
  type SlaRow,
  type Tally,
  type TallyRow,
  type WorkerRow,
} from "./report-helpers";

type TabKey = "overview" | "sites" | "workers" | "categories" | "sla";

const TABS: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "sites", label: "By site", icon: Building2 },
  { key: "workers", label: "By worker", icon: Users },
  { key: "categories", label: "By category", icon: Layers },
  { key: "sla", label: "SLA health", icon: Gauge },
];

const PRESETS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

const HEADS: Record<string, string> = {
  sites: "Site",
  workers: "Worker",
  categories: "Category",
};

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [preset, setPreset] = useState("30");
  const today = () => dayStampAt(new Date());
  const [from, setFrom] = useState(() => dayStampAt(new Date(), 29));
  const [to, setTo] = useState(today);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<TallyRow[] | null>(null);
  const [sla, setSla] = useState<SlaReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => reportSearchParams(from, to), [from, to]);

  function applyPreset(value: string) {
    setPreset(value);
    if (!value) return;
    setFrom(dayStampAt(new Date(), Number(value) - 1));
    setTo(dayStampAt(new Date()));
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "overview") {
        setOverview(await getJSON<Overview>(`/reports/overview?${query}`));
      } else if (tab === "sla") {
        setSla(await getJSON<SlaReport>(`/reports/sla?${query}`));
      } else if (tab === "sites") {
        const res = await getJSON<{ data: SiteRow[] }>(`/reports/sites?${query}`);
        setRows(reportRowsFor("sites", res.data ?? []));
      } else if (tab === "workers") {
        const res = await getJSON<{ data: WorkerRow[] }>(`/reports/workers?${query}`);
        setRows(reportRowsFor("workers", res.data ?? []));
      } else {
        const res = await getJSON<{ data: CategoryRow[] }>(`/reports/categories?${query}`);
        setRows(reportRowsFor("categories", res.data ?? []));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the report");
    } finally {
      setLoading(false);
    }
  }, [tab, query]);

  useEffect(() => {
    load();
  }, [load]);

  const exportUrl = tab === "overview" ? null : resolveApiUrl(`/reports/${tab}?${query}&format=csv`);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        subtitle="Volume, workload and SLA health for any date range — exportable as CSV."
        action={
          exportUrl && (
            <a
              href={exportUrl}
              className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 shadow-sm transition hover:border-ink-300 hover:bg-ink-50"
            >
              <Download size={15} /> Export CSV
            </a>
          )
        }
      />

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-600">
          <CalendarRange size={16} className="text-brand-600" /> Range
        </div>
        <Select
          aria-label="Quick range"
          value={preset}
          onChange={(e) => applyPreset(e.target.value)}
          className="w-auto py-2 text-xs"
        >
          <option value="">Custom</option>
          {PRESETS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <input
          type="date"
          value={from}
          max={to}
          onChange={(e) => {
            setPreset("");
            setFrom(e.target.value);
          }}
          aria-label="From date"
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        />
        <span className="text-xs text-ink-400">→</span>
        <input
          type="date"
          value={to}
          min={from}
          max={today()}
          onChange={(e) => {
            setPreset("");
            setTo(e.target.value);
          }}
          aria-label="To date"
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        />
        {loading && <span className="text-xs font-medium text-brand-600">loading…</span>}
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              tab === key
                ? "bg-brand-600 text-white shadow-sm"
                : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
          {error}
        </p>
      )}

      {tab === "overview" &&
        (overview ? (
          <div className="space-y-4">
            <TallyCards tally={overview.summary} />
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="p-5 lg:col-span-2">
                <h2 className="mb-4 font-display font-semibold text-ink-800">
                  Reported vs resolved
                </h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={overview.trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value: string) => value.slice(5)}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="total"
                        name="reported"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="resolved"
                        name="resolved"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="mb-4 font-display font-semibold text-ink-800">Severity mix</h2>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={overview.bySeverity}
                        dataKey="total"
                        nameKey="key"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {overview.bySeverity.map((entry) => (
                          <Cell key={entry.key} fill={SEVERITY_HEX[entry.key] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-3 text-xs text-ink-600">
                  {overview.bySeverity.map((entry) => (
                    <span key={entry.key} className="flex items-center gap-1 capitalize">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: SEVERITY_HEX[entry.key] ?? "#94a3b8" }}
                      />
                      {entry.key} ({entry.total})
                    </span>
                  ))}
                </div>
              </Card>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="mb-4 font-display font-semibold text-ink-800">Pipeline by status</h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.byStatus}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
                      <XAxis
                        dataKey="key"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value: string) => value.replace("_", " ")}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="mb-4 font-display font-semibold text-ink-800">Busiest sites</h2>
                {overview.topSites.length === 0 ? (
                  <p className="text-sm text-ink-400">No incidents in this range.</p>
                ) : (
                  <ul className="space-y-2">
                    {overview.topSites.map((site) => {
                      const share = overview.summary.total
                        ? Math.round((site.total / overview.summary.total) * 100)
                        : 0;
                      return (
                        <li key={site.siteId}>
                          <div className="flex items-center justify-between text-sm">
                            <Link
                              href={`/sites/${site.siteId}`}
                              className="font-medium text-brand-600 hover:text-brand-700"
                            >
                              {site.name}
                            </Link>
                            <span className="tnum text-ink-500">
                              {site.total} · {share}%
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                              style={{ width: `${share}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        ) : (
          <ReportSkeleton />
        ))}

      {(tab === "sites" || tab === "workers" || tab === "categories") &&
        (rows ? (
          <Card className="overflow-hidden">
            <TableShell
              head={
                <tr>
                  <th className="px-4 py-3 text-left">{HEADS[tab]}</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Open</th>
                  <th className="px-4 py-3 text-right">Resolved</th>
                  <th className="px-4 py-3 text-right">High+</th>
                  <th className="px-4 py-3 text-right">Overdue</th>
                  <th className="px-4 py-3 text-right">SLA</th>
                  <th className="px-4 py-3 text-right">Avg fix</th>
                </tr>
              }
            >
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-ink-400">
                    Nothing recorded in this range.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.key} className="transition hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      {row.href ? (
                        <Link
                          href={row.href}
                          className="font-semibold capitalize text-brand-600 hover:text-brand-700"
                        >
                          {row.label}
                        </Link>
                      ) : (
                        <span className="font-semibold capitalize text-ink-800">{row.label}</span>
                      )}
                      {row.sub && <p className="text-xs capitalize text-ink-400">{row.sub}</p>}
                    </td>
                    <td className="tnum px-4 py-3 text-right font-semibold text-ink-800">
                      {row.total}
                    </td>
                    <td className="tnum px-4 py-3 text-right text-ink-600">{row.open}</td>
                    <td className="tnum px-4 py-3 text-right text-ink-600">{row.resolved}</td>
                    <td className="tnum px-4 py-3 text-right text-ink-600">{row.urgent}</td>
                    <td className="tnum px-4 py-3 text-right">
                      {row.overdue > 0 ? (
                        <span className="font-semibold text-red-600">{row.overdue}</span>
                      ) : (
                        <span className="text-ink-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RateBadge rate={row.slaRate} />
                    </td>
                    <td className="tnum px-4 py-3 text-right text-ink-600">{row.avgResolution}</td>
                  </tr>
                ))
              )}
            </TableShell>
          </Card>
        ) : (
          <ReportSkeleton />
        ))}

      {tab === "sla" &&
        (sla ? (
          <div className="space-y-4">
            <TallyCards tally={sla.summary} />
            <SlaTable
              title="Missed deadlines"
              hint="Resolved after the response window closed."
              icon={<ShieldAlert size={17} className="text-red-600" />}
              rows={sla.breaches}
            />
            <SlaTable
              title="At risk right now"
              hint="Still open and either overdue or due within two hours."
              icon={<Timer size={17} className="text-amber-600" />}
              rows={sla.atRisk}
            />
          </div>
        ) : (
          <ReportSkeleton />
        ))}
    </div>
  );
}

function RateBadge({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-xs text-ink-400">—</span>;
  return <Tone tone={rate >= 90 ? "good" : rate >= 70 ? "warn" : "bad"}>{rate}%</Tone>;
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

function TallyCards({ tally }: { tally: Tally }) {
  const cards = [
    { label: "Incidents", value: tally.total, sub: `${tally.open} still open` },
    { label: "Resolved", value: tally.resolved, sub: `avg ${tally.avgResolution}` },
    { label: "High + critical", value: tally.urgent, sub: "severity spikes" },
    { label: "Overdue now", value: tally.overdue, sub: `${tally.breached} breached` },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{card.label}</p>
          <p className="tnum mt-2 font-display text-3xl font-bold text-ink-900">{card.value}</p>
          <p className="mt-0.5 text-xs text-ink-400">{card.sub}</p>
        </Card>
      ))}
      <Card className="col-span-2 flex flex-wrap items-center justify-between gap-3 p-5 lg:col-span-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            SLA compliance
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {tally.met} met · {tally.breached} breached of {tally.met + tally.breached} judged
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
              style={{ width: `${tally.slaRate ?? 0}%` }}
            />
          </div>
          <RateBadge rate={tally.slaRate} />
        </div>
      </Card>
    </div>
  );
}

function SlaTable({
  title,
  hint,
  icon,
  rows,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  rows: SlaRow[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-4">
        {icon}
        <div>
          <h2 className="font-display font-semibold text-ink-800">{title}</h2>
          <p className="text-xs text-ink-400">{hint}</p>
        </div>
        <span className="ml-auto">
          <Tone tone={rows.length ? "warn" : "good"}>{rows.length}</Tone>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink-400">Nothing here — good news.</p>
      ) : (
        <TableShell
          head={
            <tr>
              <th className="px-4 py-3 text-left">Incident</th>
              <th className="px-4 py-3 text-left">Assignee</th>
              <th className="px-4 py-3 text-left">Severity</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Deadline</th>
              <th className="px-4 py-3 text-left">SLA</th>
            </tr>
          }
        >
          {rows.map((row) => (
            <tr key={row.id} className="transition hover:bg-ink-50/60">
              <td className="px-4 py-3">
                <Link
                  href={`/incidents/${row.id}`}
                  className="font-semibold text-brand-600 hover:text-brand-700"
                >
                  {row.title}
                </Link>
                <p className="text-xs text-ink-400">{row.siteName ?? "—"}</p>
              </td>
              <td className="px-4 py-3 text-ink-600">{row.workerName ?? "Unassigned"}</td>
              <td className="px-4 py-3">
                <SeverityBadge value={row.severity} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge value={row.status} />
              </td>
              <td className="px-4 py-3 text-xs text-ink-500">{formatWhen(row.dueAt)}</td>
              <td className="px-4 py-3">
                <SlaBadge sla={row.sla} />
              </td>
            </tr>
          ))}
        </TableShell>
      )}
    </Card>
  );
}
