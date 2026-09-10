"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ClipboardList, Clock, MapPin, Phone, Users } from "lucide-react";
import { getJSON } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { DetailHero } from "@/components/DetailHero";
import { Card, Badge, SeverityBadge, StatusBadge, SlaBadge, EmptyState, Skeleton, SEVERITY_HEX } from "@/components/ui";

interface Site {
  id: number;
  name: string;
  code: string;
  location: string;
  status: string;
}

interface Crew {
  assignmentId: number;
  workerId: number;
  name: string;
  role: string;
  phone: string;
  status: string;
  assignedAt: string;
}

interface Incident {
  id: number;
  title: string;
  category: string;
  severity: string;
  status: string;
  workerName: string | null;
  dueAt: string | null;
  createdAt: string;
  sla: { label: string; tone: string; state: string };
}

interface Payload {
  site: Site;
  crew: Crew[];
  incidents: Incident[];
  stats: { total: number; open: number; critical: number; overdue: number };
}

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON<Payload>(`/sites/${id}`)
      .then(setPayload)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error)
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
        {error}
      </p>
    );

  if (!payload)
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-1/2" />
        <div className="grid gap-4 sm:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );

  const { site, crew, incidents, stats } = payload;
  return (
    <div className="space-y-6">
      <DetailHero
        backHref="/sites"
        backLabel="Back to sites"
        eyebrow="Site profile"
        title={site.name}
        subtitle={
          <>
            <span className="font-mono text-xs font-semibold text-ink-600">{site.code}</span>
            <span className="mx-2 text-ink-300">•</span>
            <span className="inline-flex items-center gap-1"><MapPin size={14} className="text-emerald-600" />{site.location || "Location unavailable"}</span>
          </>
        }
        badges={
          <Badge className={site.status === "active" ? "bg-emerald-100 text-emerald-700 ring-emerald-600/20" : "bg-ink-100 text-ink-500 ring-ink-500/20"}>
            {site.status}
          </Badge>
        }
        accent="emerald"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Users size={18} />} label="Assigned crew" value={crew.length} />
        <StatCard
          icon={<ClipboardList size={18} />}
          label="Open incidents"
          value={stats.open}
          sub={`${stats.total} total`}
          href={`/incidents?siteId=${site.id}`}
        />
        <StatCard
          icon={<AlertTriangle size={18} />}
          label="Critical"
          value={stats.critical}
          accent={stats.critical > 0}
          href={`/incidents?siteId=${site.id}&severity=critical`}
        />
        <StatCard
          icon={<Clock size={18} />}
          label="Overdue"
          value={stats.overdue}
          accent={stats.overdue > 0}
          href={`/incidents?siteId=${site.id}&sla=overdue`}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display font-semibold text-ink-800">
            <Users size={18} className="text-brand-600" /> Assigned crew
          </h2>
          {crew.length === 0 ? (
            <p className="text-sm text-ink-400">No workers assigned to this site.</p>
          ) : (
            <ul className="space-y-2">
              {crew.map((w) => (
                <li
                  key={w.assignmentId}
                  className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-2"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
                    {w.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">{w.name}</p>
                    <p className="truncate text-xs text-ink-400">{w.role}</p>
                    {w.phone && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-ink-400">
                        <Phone size={11} /> {w.phone}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/workers?siteId=${site.id}`}
            className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            Manage crew →
          </Link>
        </Card>
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
            <h2 className="flex items-center gap-2 font-display font-semibold text-ink-800">
              <ClipboardList size={18} className="text-brand-600" /> Latest incidents
            </h2>
            <Link
              href={`/incidents?siteId=${site.id}`}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              All incidents →
            </Link>
          </div>
          {incidents.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={20} />}
              title="No incidents logged"
              hint="This site has no reported incidents yet."
            />
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-ink-100">
                {incidents.map((i) => (
                  <tr key={i.id} className="transition hover:bg-ink-50/60">
                    <td className="relative py-3 pl-4 pr-4">
                      <span
                        className="absolute left-0 top-0 h-full w-1"
                        style={{ background: SEVERITY_HEX[i.severity] ?? SEVERITY_HEX.medium }}
                      />
                      <Link
                        href={`/incidents/${i.id}`}
                        className="font-medium text-ink-800 hover:text-brand-700"
                      >
                        {i.title}
                      </Link>
                      <p className="text-xs capitalize text-ink-400">
                        {i.category} · {i.workerName ?? "unassigned"} · {timeAgo(i.createdAt)}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <SlaBadge sla={i.sla} />
                    </td>
                    <td className="px-3 py-3">
                      <SeverityBadge value={i.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge value={i.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  accent?: boolean;
  href?: string;
}) {
  const body = (
    <Card className={"p-4 transition " + (accent ? "ring-1 ring-red-200 " : "") + (href ? "hover:shadow-pop" : "")}>
      <div className="flex items-center gap-2 text-ink-400">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={"mt-2 font-display text-3xl font-bold " + (accent ? "text-red-600" : "text-ink-900")}>
        {value}
      </p>
      {sub && <p className="text-xs text-ink-400">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
