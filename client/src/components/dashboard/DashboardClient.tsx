"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDot,
  Gauge,
  Inbox,
  Link2,
  Plus,
  Settings2,
  ShieldAlert,
  Timer,
  TimerOff,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { getJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { formatWhen } from "@/lib/time";
import { Card, EmptyState, SeverityBadge, Skeleton, SlaBadge, StatusBadge } from "@/components/ui";
import { SiteFormModal } from "@/components/admin/SiteFormModal";
import { UserFormModal } from "@/components/admin/UserFormModal";
import { AssignWorkerModal } from "@/components/admin/AssignWorkerModal";
import { MyWork } from "@/components/worker/MyWork";

interface Watch {
  id: number;
  title: string;
  status: string;
  severity: string;
  siteName: string | null;
  workerName: string | null;
  dueAt: string | null;
  createdAt: string;
  sla: { label: string; tone: string; state: string };
}

export interface DashboardStats {
  totals: {
    sites: number;
    activeSites: number;
    workers: number;
    availableWorkers: number;
    linkedWorkers: number;
    incidents: number;
    openIncidents: number;
    unassigned: number;
    pendingApprovals: number;
    unreadNotifications: number;
  };
  sla: {
    overdue: number;
    dueSoon: number;
    breached: number;
    met: number;
    complianceRate: number | null;
  };
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  trend: { date: string; count: number }[];
  recent: Watch[];
  attention: Watch[];
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-slate-400",
  assigned: "bg-blue-500",
  in_progress: "bg-violet-500",
  resolved: "bg-emerald-500",
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

function DashboardWatchItem({ item, attention = false }: { item: Watch; attention?: boolean }) {
  return (
    <Link
      href={`/incidents/${item.id}`}
      className="dashboard-watch-item group grid gap-3 px-5 py-4 transition sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink-800 group-hover:text-brand-700">{item.title}</p>
        <p className="mt-1 truncate text-xs text-ink-500">
          {item.siteName ?? "No site"} <span aria-hidden="true">·</span> {item.workerName ?? "Unassigned"}
          {attention && <><span aria-hidden="true"> · </span>Due {formatWhen(item.dueAt)}</>}
        </p>
      </div>
      <div className={`dashboard-watch-meta ${attention ? "dashboard-watch-meta--attention" : "dashboard-watch-meta--recent"}`}>
        {attention && <SlaBadge sla={item.sla} />}
        <SeverityBadge value={item.severity} />
        <StatusBadge value={item.status} />
      </div>
    </Link>
  );
}

function QueuePanel({
  title,
  icon,
  href,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="dashboard-queue-panel overflow-hidden p-0">
      <div className="dashboard-panel-header flex items-center justify-between px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink-800">
          {icon}
          {title}
        </h2>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
          View all <ArrowUpRight size={13} />
        </Link>
      </div>
      {children}
    </Card>
  );
}

export default function DashboardClient({
  initialStats,
  initialError = "",
}: {
  initialStats: DashboardStats | null;
  initialError?: string;
}) {
  const { isAdmin } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(initialStats);
  const [error, setError] = useState(initialError);
  const [modal, setModal] = useState<null | "site" | "user" | "assign">(null);

  function loadStats() {
    getJSON<DashboardStats>("/stats").then(setStats).catch((e) => setError(e.message));
  }

  if (error) {
    return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">{error}</p>;
  }

  if (!stats) {
    return (
      <div className="dashboard-monitor space-y-5">
        <div className="h-16 rounded-xl skeleton" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ink-200 bg-ink-200 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-none" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]"><Skeleton className="h-[32rem]" /><Skeleton className="h-80" /></div>
      </div>
    );
  }

  const criticalOpen = stats.recent.filter((item) => item.severity === "critical" && item.status !== "resolved").length;
  const complianceRate = stats.sla.complianceRate ?? 0;
  const statusData = Object.entries(stats.byStatus);
  const severityData = Object.entries(stats.bySeverity);
  const largestDistribution = Math.max(1, ...statusData.map(([, value]) => value), ...severityData.map(([, value]) => value));
  const health = [
    { label: "Open work", value: stats.totals.openIncidents, detail: `${stats.totals.unassigned} unassigned`, tone: "text-ink-900" },
    { label: "Overdue", value: stats.sla.overdue, detail: "Needs intervention", tone: "text-red-700 dark:text-red-300" },
    { label: "Due soon", value: stats.sla.dueSoon, detail: "Within SLA window", tone: "text-amber-700 dark:text-amber-300" },
    { label: "Available", value: stats.totals.availableWorkers, detail: `${stats.totals.workers} total workers`, tone: "text-emerald-700" },
  ];

  return (
    <div className="dashboard-monitor space-y-5">
      <header className="dashboard-monitor-header flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">Live operations</p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-[-0.04em] text-ink-900">Operations dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">Priorities, service level, and workload in one place.</p>
        </div>
        <Link href="/incidents" className="dashboard-monitor-action inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold">
          Open incident workspace <ArrowUpRight size={15} />
        </Link>
      </header>

      <section className="dashboard-health-strip grid grid-cols-2 divide-x divide-y divide-ink-200 overflow-hidden rounded-xl border border-ink-200 bg-ink-200 lg:grid-cols-4 lg:divide-y-0" aria-label="Operational health summary">
        {health.map((item) => (
          <div key={item.label} className="bg-white px-4 py-4 sm:px-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">{item.label}</p>
            <p className={`tnum mt-1.5 font-display text-2xl font-semibold ${item.tone}`}>{item.value}</p>
            <p className="mt-1 text-xs text-ink-500">{item.detail}</p>
          </div>
        ))}
      </section>

      {(criticalOpen > 0 || (isAdmin && stats.totals.pendingApprovals > 0)) && (
        <section className="dashboard-notice-stack" aria-label="Operational notices">
          {criticalOpen > 0 && (
            <Link href="/incidents?severity=critical" className="dashboard-notice dashboard-notice-critical">
              <ShieldAlert size={16} />
              <span><strong>{criticalOpen} critical incident{criticalOpen > 1 ? "s" : ""}</strong> require immediate triage.</span>
              <ArrowUpRight size={14} className="ml-auto" />
            </Link>
          )}
          {isAdmin && stats.totals.pendingApprovals > 0 && (
            <Link href="/members" className="dashboard-notice dashboard-notice-review">
              <UserCheck size={16} />
              <span><strong>{stats.totals.pendingApprovals} registration{stats.totals.pendingApprovals > 1 ? "s" : ""}</strong> waiting for review.</span>
              <ArrowUpRight size={14} className="ml-auto" />
            </Link>
          )}
        </section>
      )}

      {!isAdmin && <MyWork />}

      <section className="dashboard-primary-grid grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <QueuePanel title="Needs attention" icon={<ShieldAlert size={16} className="text-red-600" />} href="/incidents?sla=overdue">
          {stats.attention.length === 0 ? (
            <div className="p-5"><EmptyState icon={<CircleDot size={20} />} title="Every deadline is under control" hint="Incidents approaching their response window appear here." /></div>
          ) : (
            <ul className="dashboard-queue-list divide-y divide-ink-100">
              {stats.attention.map((item) => <li key={item.id}><DashboardWatchItem item={item} attention /></li>)}
            </ul>
          )}
        </QueuePanel>

        <Card className="dashboard-sla-panel self-start p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-400">Service level</p>
              <h2 className="mt-1 flex items-center gap-2 font-display text-sm font-semibold text-ink-800"><Gauge size={16} className="text-brand-600" /> SLA health</h2>
            </div>
            <span className="tnum text-2xl font-semibold text-ink-900">{stats.sla.complianceRate === null ? "—" : `${stats.sla.complianceRate}%`}</span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${complianceRate}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-500">Incidents completed within their agreed response window.</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-ink-100 pt-4">
            <div><dt className="flex items-center gap-1 text-xs text-ink-500"><TimerOff size={13} className="text-red-600 dark:text-red-300" /> Overdue</dt><dd className="tnum mt-1 text-lg font-semibold text-red-700 dark:text-red-300">{stats.sla.overdue}</dd></div>
            <div><dt className="flex items-center gap-1 text-xs text-ink-500"><Timer size={13} className="text-amber-600 dark:text-amber-300" /> Due soon</dt><dd className="tnum mt-1 text-lg font-semibold text-amber-700 dark:text-amber-300">{stats.sla.dueSoon}</dd></div>
            <div><dt className="text-xs text-ink-500">Met on time</dt><dd className="tnum mt-1 text-lg font-semibold text-ink-800">{stats.sla.met}</dd></div>
            <div><dt className="text-xs text-ink-500">Breached</dt><dd className="tnum mt-1 text-lg font-semibold text-ink-800">{stats.sla.breached}</dd></div>
          </dl>
          <div className="dashboard-sla-guidance mt-5 rounded-lg px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-400">Recommended next step</p>
            <p className="mt-1 text-xs leading-5 text-ink-600">{stats.sla.overdue > 0 ? `${stats.sla.overdue} overdue incident${stats.sla.overdue > 1 ? "s" : ""} need triage before the next handoff.` : "No overdue incidents. Keep the current response pace."}</p>
            <Link href="/incidents?sla=overdue" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">Review SLA queue <ArrowUpRight size={13} /></Link>
          </div>
          <Link href="/reports" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">Open SLA report <ArrowUpRight size={13} /></Link>
        </Card>
      </section>

      <section className="dashboard-secondary-grid grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-400">Activity</p><h2 className="mt-1 font-display text-sm font-semibold text-ink-800">Incident volume · last 7 days</h2></div>
            <span className="text-xs text-ink-400">Reported incidents</span>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.trend} margin={{ top: 6, right: 4, bottom: 0, left: -22 }}>
                <CartesianGrid vertical={false} stroke="#e8edf5" strokeDasharray="3 4" />
                <XAxis axisLine={false} tickLine={false} dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(date) => date.slice(5)} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3, fill: "#4f46e5", strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="dashboard-distribution p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-400">Workload mix</p>
          <h2 className="mt-1 font-display text-sm font-semibold text-ink-800">Current distribution</h2>
          <div className="mt-5 space-y-4">
            {statusData.map(([name, value]) => (
              <div key={name}><div className="mb-1.5 flex items-center justify-between text-xs"><span className="capitalize text-ink-600">{label(name)}</span><span className="tnum font-semibold text-ink-800">{value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-ink-100"><div className={`h-full rounded-full ${STATUS_COLORS[name] ?? "bg-ink-400"}`} style={{ width: `${(value / largestDistribution) * 100}%` }} /></div></div>
            ))}
          </div>
          {severityData.length > 0 && <div className="mt-5 border-t border-ink-100 pt-4"><p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-ink-400">Priority</p><div className="flex flex-wrap gap-2">{severityData.map(([name, value]) => <span key={name} className="inline-flex items-center gap-1.5 text-xs text-ink-600"><i className={`h-2 w-2 rounded-full ${SEVERITY_COLORS[name] ?? "bg-ink-400"}`} />{label(name)} <b className="tnum text-ink-800">{value}</b></span>)}</div></div>}
        </Card>
      </section>

      {isAdmin && (
        <Card className="dashboard-admin-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2"><Settings2 size={16} className="text-brand-600" /><div><p className="font-display text-sm font-semibold text-ink-800">Admin actions</p><p className="text-xs text-ink-500">Common setup tasks</p></div></div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
              <button onClick={() => setModal("site")} className="dashboard-quick-action"><Plus size={15} /> New site</button>
              <button onClick={() => setModal("user")} className="dashboard-quick-action"><UserPlus size={15} /> New user</button>
              <button onClick={() => setModal("assign")} className="dashboard-quick-action"><Link2 size={15} /> Assign worker</button>
            </div>
          </div>
        </Card>
      )}

      <QueuePanel title="Recent incidents" icon={<AlertTriangle size={16} className="text-brand-600" />} href="/incidents">
        {stats.recent.length === 0 ? (
          <div className="p-5"><EmptyState icon={<Inbox size={20} />} title="No incidents yet" hint="Reported incidents will appear here." /></div>
        ) : (
          <ul className="dashboard-queue-list divide-y divide-ink-100">{stats.recent.map((item) => <li key={item.id}><DashboardWatchItem item={item} /></li>)}</ul>
        )}
      </QueuePanel>

      {isAdmin && <><SiteFormModal open={modal === "site"} onClose={() => setModal(null)} onSaved={loadStats} /><UserFormModal open={modal === "user"} onClose={() => setModal(null)} onSaved={() => {}} /><AssignWorkerModal open={modal === "assign"} onClose={() => setModal(null)} onSaved={loadStats} /></>}
    </div>
  );
}
