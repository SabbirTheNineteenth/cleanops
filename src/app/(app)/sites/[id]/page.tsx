"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Users, ClipboardList, AlertTriangle } from "lucide-react";
import { getJSON } from "@/lib/api";
import { Card, Badge, SeverityBadge, StatusBadge, EmptyState, Skeleton, SEVERITY_HEX } from "@/components/ui";

interface Site {
  id: number;
  name: string;
  code: string;
  location: string;
  status: string;
}
interface Assignment {
  id: number;
  workerId: number;
  workerName: string | null;
  workerRole: string | null;
}
interface Incident {
  id: number;
  title: string;
  category: string;
  severity: string;
  status: string;
  workerName: string | null;
  createdAt: string;
}

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [site, setSite] = useState<Site | null>(null);
  const [workers, setWorkers] = useState<Assignment[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON<{ site: Site }>(`/sites/${id}`)
      .then((d) => setSite(d.site))
      .catch((e) => setError(e.message));
    getJSON<{ assignments: Assignment[] }>(`/assignments?siteId=${id}`).then((d) => setWorkers(d.assignments));
    getJSON<{ incidents: Incident[] }>(`/incidents?siteId=${id}`).then((d) => setIncidents(d.incidents));
  }, [id]);

  if (error)
    return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">{error}</p>;
  if (!site)
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-1/2" />
        <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        <Skeleton className="h-64" />
      </div>
    );

  const open = incidents.filter((i) => i.status !== "resolved").length;
  const critical = incidents.filter((i) => i.severity === "critical" && i.status !== "resolved").length;

  return (
    <div className="space-y-6">
      <button onClick={() => router.push("/sites")} className="inline-flex items-center gap-1 text-sm text-ink-500 transition hover:text-ink-800">
        <ArrowLeft size={16} /> Back to sites
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-ink-200/70 bg-white p-5 shadow-card">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Site</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">{site.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-500">
            <span className="font-mono text-xs">{site.code}</span> ·
            <span className="inline-flex items-center gap-1"><MapPin size={14} className="text-ink-400" />{site.location || "—"}</span>
          </p>
        </div>
        <Badge className={site.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-ink-100 text-ink-500 ring-ink-500/20"}>
          {site.status}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Users size={18} />} label="Assigned workers" value={workers.length} />
        <StatCard icon={<ClipboardList size={18} />} label="Open incidents" value={open} sub={`${incidents.length} total`} />
        <StatCard icon={<AlertTriangle size={18} />} label="Critical (open)" value={critical} accent={critical > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display font-semibold text-ink-800"><Users size={18} className="text-brand-600" /> Assigned workers</h2>
          {workers.length === 0 ? (
            <p className="text-sm text-ink-400">No workers assigned to this site.</p>
          ) : (
            <ul className="space-y-2">
              {workers.map((w) => (
                <li key={w.id} className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
                    {(w.workerName ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-800">{w.workerName ?? "—"}</p>
                    <p className="text-xs text-ink-400">{w.workerRole ?? ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link href="/workers" className="mt-3 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700">Manage workers →</Link>
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
            <h2 className="flex items-center gap-2 font-display font-semibold text-ink-800"><ClipboardList size={18} className="text-brand-600" /> Incidents at this site</h2>
            <Link href={`/incidents`} className="text-xs font-semibold text-brand-600 hover:text-brand-700">All incidents →</Link>
          </div>
          {incidents.length === 0 ? (
            <EmptyState icon={<ClipboardList size={20} />} title="No incidents logged" hint="This site has no reported incidents yet." />
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id} className="group border-b border-ink-100 transition last:border-0 hover:bg-ink-50/60">
                    <td className="relative py-3 pl-4 pr-4">
                      <span className="absolute left-0 top-0 h-full w-1" style={{ background: SEVERITY_HEX[i.severity] ?? SEVERITY_HEX.medium }} />
                      <Link href={`/incidents/${i.id}`} className="font-medium text-ink-800 hover:text-brand-700">{i.title}</Link>
                      <p className="text-xs capitalize text-ink-400">{i.category} · {i.workerName ?? "unassigned"}</p>
                    </td>
                    <td className="px-3 py-3"><SeverityBadge value={i.severity} /></td>
                    <td className="px-4 py-3"><StatusBadge value={i.status} /></td>
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

function StatCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: number; sub?: string; accent?: boolean }) {
  return (
    <Card className={"p-4 " + (accent ? "ring-1 ring-red-200" : "")}>
      <div className="flex items-center gap-2 text-ink-400">{icon}<span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div>
      <p className={"mt-2 font-display text-3xl font-bold " + (accent ? "text-red-600" : "text-ink-900")}>{value}</p>
      {sub && <p className="text-xs text-ink-400">{sub}</p>}
    </Card>
  );
}
