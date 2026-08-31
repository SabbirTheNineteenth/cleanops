"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { Building2, Users, AlertTriangle, CircleDot, ShieldAlert, ArrowUpRight, Inbox, Plus, UserPlus, Link2, Settings2, UserCheck } from "lucide-react";
import { getJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { Card, Button, SeverityBadge, StatusBadge, Skeleton, EmptyState, SEVERITY_HEX } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { SiteFormModal } from "@/components/admin/SiteFormModal";
import { UserFormModal } from "@/components/admin/UserFormModal";
import { AssignWorkerModal } from "@/components/admin/AssignWorkerModal";
import { MyWork } from "@/components/worker/MyWork";

interface Stats {
  totals: {
    sites: number;
    activeSites: number;
    workers: number;
    availableWorkers: number;
    incidents: number;
    openIncidents: number;
    pendingApprovals: number;
  };
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  trend: { date: string; count: number }[];
  recent: {
    id: number;
    title: string;
    status: string;
    severity: string;
    siteName: string | null;
    createdAt: string;
  }[];
}

const SEVERITY_COLORS = SEVERITY_HEX;

export default function DashboardPage() {
  const { isAdmin } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<null | "site" | "user" | "assign">(null);

  function loadStats() {
    getJSON<Stats>("/stats")
      .then(setStats)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    loadStats();
  }, []);

  if (error)
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
        {error}
      </p>
    );

  if (!stats)
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Overview" title="Dashboard" subtitle="Operations overview at a glance." />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );

  const criticalOpen = stats.recent.filter(
    (i) => i.severity === "critical" && i.status !== "resolved",
  ).length;

  const statusData = Object.entries(stats.byStatus).map(([k, v]) => ({
    name: k.replace("_", " "),
    value: v,
  }));
  const severityData = Object.entries(stats.bySeverity).map(([k, v]) => ({
    name: k,
    value: v,
  }));

  const cards = [
    { label: "Total Sites", value: stats.totals.sites, sub: `${stats.totals.activeSites} active`, icon: Building2 },
    { label: "Workers", value: stats.totals.workers, sub: `${stats.totals.availableWorkers} available`, icon: Users },
    { label: "Open Incidents", value: stats.totals.openIncidents, sub: `${stats.totals.incidents} total`, icon: AlertTriangle },
    { label: "Resolved", value: stats.byStatus.resolved ?? 0, sub: "all time", icon: CircleDot },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Overview" title="Dashboard" subtitle="Operations overview at a glance." />

      {isAdmin && stats.totals.pendingApprovals > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <UserCheck size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {stats.totals.pendingApprovals} registration{stats.totals.pendingApprovals > 1 ? "s" : ""} awaiting approval
            </p>
            <p className="text-xs text-amber-700">Approve to activate the account and add them as a worker.</p>
          </div>
          <Link
            href="/members"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700"
          >
            Review <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      {criticalOpen > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <ShieldAlert size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-800">
              {criticalOpen} critical incident{criticalOpen > 1 ? "s" : ""} need attention
            </p>
            <p className="text-xs text-red-600">Review and assign these before anything else.</p>
          </div>
          <Link
            href="/incidents?severity=critical"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          >
            Triage <ArrowUpRight size={14} />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5 transition hover:shadow-pop">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{c.label}</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <c.icon size={16} />
              </span>
            </div>
            <p className="tnum mt-3 font-display text-3xl font-bold text-ink-900">{c.value}</p>
            <p className="mt-0.5 text-xs text-ink-400">{c.sub}</p>
          </Card>
        ))}
      </div>

      {!isAdmin && <MyWork />}

      {isAdmin && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Settings2 size={16} />
            </span>
            <div>
              <h2 className="font-display font-semibold text-ink-800">Admin control</h2>
              <p className="text-xs text-ink-400">Manage everything from here.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <button
              onClick={() => setModal("site")}
              className="group flex items-center gap-3 rounded-xl border border-ink-200/70 bg-white p-3 text-left transition hover:border-brand-300 hover:shadow-pop"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-100">
                <Plus size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-800">New site</p>
                <p className="text-xs text-ink-400">Create a location</p>
              </div>
            </button>
            <button
              onClick={() => setModal("user")}
              className="group flex items-center gap-3 rounded-xl border border-ink-200/70 bg-white p-3 text-left transition hover:border-brand-300 hover:shadow-pop"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-100">
                <UserPlus size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-800">New user</p>
                <p className="text-xs text-ink-400">Create login credentials</p>
              </div>
            </button>
            <button
              onClick={() => setModal("assign")}
              className="group flex items-center gap-3 rounded-xl border border-ink-200/70 bg-white p-3 text-left transition hover:border-brand-300 hover:shadow-pop"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition group-hover:bg-brand-100">
                <Link2 size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-800">Assign worker</p>
                <p className="text-xs text-ink-400">Put a worker on a site</p>
              </div>
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3 text-xs">
            <Link href="/sites" className="rounded-md px-2 py-1 font-medium text-brand-600 hover:bg-brand-50">Manage sites →</Link>
            <Link href="/workers" className="rounded-md px-2 py-1 font-medium text-brand-600 hover:bg-brand-50">Manage workers →</Link>
            <Link href="/members" className="rounded-md px-2 py-1 font-medium text-brand-600 hover:bg-brand-50">Manage members →</Link>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-display font-semibold text-ink-800">Incidents (last 7 days)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-display font-semibold text-ink-800">By severity</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={severityData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {severityData.map((entry) => (
                    <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] ?? "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 text-xs text-ink-600">
            {severityData.map((s) => (
              <span key={s.name} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_COLORS[s.name] }} />
                {s.name} ({s.value})
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-4 font-display font-semibold text-ink-800">By status</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display font-semibold text-ink-800">Recent incidents</h2>
            <Link href="/incidents" className="text-sm font-medium text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {stats.recent.length === 0 && (
              <EmptyState
                icon={<Inbox size={20} />}
                title="No incidents yet"
                hint="Reported incidents will appear here."
              />
            )}
            {stats.recent.map((i) => (
              <Link
                key={i.id}
                href={`/incidents/${i.id}`}
                className="group relative flex items-center justify-between overflow-hidden rounded-lg border border-ink-100 py-2 pl-4 pr-3 transition hover:border-ink-200 hover:bg-ink-50"
              >
                <span
                  className="absolute left-0 top-0 h-full w-1"
                  style={{ background: SEVERITY_HEX[i.severity] ?? SEVERITY_HEX.medium }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-800 group-hover:text-ink-900">{i.title}</p>
                  <p className="text-xs text-ink-400">{i.siteName ?? "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SeverityBadge value={i.severity} />
                  <StatusBadge value={i.status} />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {isAdmin && (
        <>
          <SiteFormModal open={modal === "site"} onClose={() => setModal(null)} onSaved={loadStats} />
          <UserFormModal open={modal === "user"} onClose={() => setModal(null)} onSaved={() => {}} />
          <AssignWorkerModal open={modal === "assign"} onClose={() => setModal(null)} onSaved={loadStats} />
        </>
      )}
    </div>
  );
}
