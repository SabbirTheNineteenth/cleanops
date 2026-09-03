"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Sparkles, RefreshCw, Trash2, Cpu, UserCheck, Clock } from "lucide-react";
import { getJSON, patchJSON, postJSON, deleteJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { Button, Card, Label, Select, Textarea, Badge, SeverityBadge, StatusBadge, Skeleton, SEVERITY_HEX } from "@/components/ui";

interface Incident {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  severity: string;
  siteId: number;
  siteName: string | null;
  assignedTo: number | null;
  workerName: string | null;
  reporterName: string | null;
  aiSummary: string | null;
  aiSeverity: string | null;
  aiSuggestedAction: string | null;
  aiRecommendedRole: string | null;
  aiResponseWindow: string | null;
  aiSource: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
interface Worker {
  id: number;
  name: string;
  role: string;
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useSession();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function load() {
    getJSON<{ incident: Incident }>(`/incidents/${id}`)
      .then((d) => {
        setIncident(d.incident);
        setNote(d.incident.resolutionNote ?? "");
      })
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    load();
    getJSON<{ data: Worker[] }>("/workers?pageSize=200").then((d) => setWorkers(d.data ?? []));

  }, [id]);

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await patchJSON(`/incidents/${id}`, patch);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function reanalyze() {
    setBusy(true);
    try {
      await postJSON(`/incidents/${id}/analyze`, {});
      load();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this incident?")) return;
    await deleteJSON(`/incidents/${id}`);
    router.push("/incidents");
  }

  if (error)
    return (
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
        {error}
      </p>
    );
  if (!incident)
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-52" />
          </div>
          <Skeleton className="h-72" />
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/incidents")}
        className="inline-flex items-center gap-1 text-sm text-ink-500 transition hover:text-ink-800"
      >
        <ArrowLeft size={16} /> Back to incidents
      </button>

      <div className="relative flex flex-wrap items-start justify-between gap-3 overflow-hidden rounded-2xl border border-ink-200/70 bg-white p-5 shadow-card">
        <span
          className="absolute left-0 top-0 h-full w-1.5"
          style={{ background: SEVERITY_HEX[incident.severity] ?? SEVERITY_HEX.medium }}
        />
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">{incident.title}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {incident.siteName ? (
              <Link href={`/sites/${incident.siteId}`} className="font-medium text-brand-600 hover:text-brand-700">{incident.siteName}</Link>
            ) : "—"}{" "}
            · reported by {incident.reporterName ?? "—"} ·{" "}
            {new Date(incident.createdAt + "Z").toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SeverityBadge value={incident.severity} />
          <StatusBadge value={incident.status} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-2 font-display font-semibold text-ink-800">Description</h2>
            <p className="whitespace-pre-wrap text-sm text-ink-600">
              {incident.description || "No description provided."}
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <span className="text-ink-500">Category: <span className="capitalize text-ink-800">{incident.category}</span></span>
              <span className="text-ink-500">Assignee: <span className="text-ink-800">{incident.workerName ?? "Unassigned"}</span></span>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-brand-100 bg-gradient-to-r from-brand-50 to-transparent px-5 py-3">
              <div className="flex items-center gap-2">
              <h2 className="flex items-center gap-2 font-display font-semibold text-ink-800">
                <Sparkles size={18} className="text-brand-600" /> AI Assistance
              </h2>
              {incident.aiSource && (
                <Badge className={incident.aiSource === "openrouter" ? "bg-violet-50 text-violet-700 ring-violet-600/20" : "bg-ink-100 text-ink-500 ring-ink-500/20"}>
                  <Cpu size={11} /> {incident.aiSource === "openrouter" ? "OpenRouter AI" : "Heuristic"}
                </Badge>
              )}
            </div>
            {isAdmin && (
              <Button variant="secondary" className="text-xs" onClick={reanalyze} disabled={busy}>
                <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Re-analyze
              </Button>
            )}
          </div>
          <div className="p-5">
            {incident.aiSummary ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Summary</p>
                  <p className="mt-0.5 text-ink-700">{incident.aiSummary}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Suggested severity</p>
                    <div className="mt-1"><SeverityBadge value={incident.aiSeverity ?? "medium"} /></div>
                  </div>
                  {incident.aiRecommendedRole && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Recommended role</p>
                      <p className="mt-1 inline-flex items-center gap-1 text-ink-700"><UserCheck size={14} className="text-brand-500" />{incident.aiRecommendedRole}</p>
                    </div>
                  )}
                  {incident.aiResponseWindow && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Response window</p>
                      <p className="mt-1 inline-flex items-center gap-1 text-ink-700"><Clock size={14} className="text-brand-500" />{incident.aiResponseWindow}</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Suggested action</p>
                  <p className="mt-0.5 text-ink-700">{incident.aiSuggestedAction}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-400">No AI analysis available.</p>
            )}
          </div>
          </Card>
        </div>

        <div className="space-y-4">
          {isAdmin ? (
            <Card className="p-5">
              <h2 className="mb-3 font-display font-semibold text-ink-800">Manage</h2>
              <div className="space-y-3">
                <div>
                  <Label>Assign worker</Label>
                  <Select
                    value={incident.assignedTo ?? ""}
                    onChange={(e) => update({ assignedTo: e.target.value ? Number(e.target.value) : null })}
                    disabled={busy}
                  >
                    <option value="">Unassigned</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} — {w.role}
                        {incident.aiRecommendedRole && w.role === incident.aiRecommendedRole ? "  ★ recommended" : ""}
                      </option>
                    ))}
                  </Select>
                  {incident.aiRecommendedRole && (
                    <p className="mt-1 text-xs text-ink-400">AI recommends a <span className="font-medium text-ink-600">{incident.aiRecommendedRole}</span> for this incident.</p>
                  )}
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={incident.status} onChange={(e) => update({ status: e.target.value })} disabled={busy}>
                    <option value="open">Open</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                  </Select>
                </div>
                <div>
                  <Label>Severity</Label>
                  <Select value={incident.severity} onChange={(e) => update({ severity: e.target.value })} disabled={busy}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </Select>
                </div>
                <div>
                  <Label>Resolution note</Label>
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button className="mt-2 w-full" onClick={() => update({ resolutionNote: note, status: "resolved" })} disabled={busy}>
                    Save & resolve
                  </Button>
                </div>
                <Button variant="ghost" className="w-full text-red-600" onClick={remove}>
                  <Trash2 size={14} /> Delete incident
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-5 text-sm text-ink-500">
              Only admins can assign or resolve incidents. Your report has been
              logged and analyzed.
            </Card>
          )}

          {incident.resolutionNote && (
            <Card className="p-5">
              <h2 className="mb-1 font-display font-semibold text-ink-800">Resolution</h2>
              <p className="text-sm text-ink-600">{incident.resolutionNote}</p>
              {incident.resolvedAt && (
                <p className="mt-1 text-xs text-ink-400">
                  Resolved {new Date(incident.resolvedAt + "Z").toLocaleString()}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
