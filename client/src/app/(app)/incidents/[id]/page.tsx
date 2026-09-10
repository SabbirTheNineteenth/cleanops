"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Clock, Cpu, RefreshCw, Sparkles, Trash2, UserCheck } from "lucide-react";
import { deleteJSON, getJSON, patchJSON, postJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { formatWhen, parseTime, timeAgo } from "@/lib/time";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Select,
  SeverityBadge,
  Skeleton,
  SlaBadge,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { CommentThread } from "@/components/incident/CommentThread";
import { Checklist } from "@/components/incident/Checklist";
import { DetailHero } from "@/components/DetailHero";
import { Timeline } from "@/components/incident/Timeline";

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
  reportedBy: number;
  reporterName: string | null;
  aiSummary: string | null;
  aiSeverity: string | null;
  aiSuggestedAction: string | null;
  aiRecommendedRole: string | null;
  aiResponseWindow: string | null;
  aiSource: string | null;
  aiStatus: "pending" | "processing" | "completed" | "failed";
  resolutionNote: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  resolvedAt: string | null;
  sla: { label: string; tone: string; state: string };
}

interface Worker {
  id: number;
  name: string;
  role: string;
}

function toLocalInput(value: string | null): string {
  const parsed = parseTime(value);
  if (!parsed) return "";
  const shifted = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, userId, worker } = useSession();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [pulse, setPulse] = useState(0);

  const load = useCallback(() => {
    getJSON<{ incident: Incident }>(`/incidents/${id}`)
      .then((d) => {
        setIncident(d.incident);
        setNote(d.incident.resolutionNote ?? "");
        setDue(toLocalInput(d.incident.dueAt));
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    getJSON<{ data: Worker[] }>("/workers?pageSize=200")
      .then((d) => setWorkers(d.data ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load workers"));
  }, [load]);

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      if (!incident) return;
      await patchJSON(`/incidents/${id}`, { ...patch, version: incident.version });
      load();
      setPulse((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function reanalyze() {
    setBusy(true);
    setError("");
    try {
      await postJSON(`/incidents/${id}/analyze`, {});
      load();
      setPulse((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this incident? Comments, checklist and history go with it.")) return;
    setDeleting(true); setError("");
    try { await deleteJSON(`/incidents/${id}`); router.push("/incidents"); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete incident"); }
    finally { setDeleting(false); }
  }

  const canWork = useMemo(() => {
    if (!incident) return false;
    if (isAdmin) return true;
    if (userId && incident.reportedBy === userId) return true;
    return Boolean(worker && incident.assignedTo === worker.id);
  }, [incident, isAdmin, userId, worker]);

  if (error && !incident)
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
      <DetailHero
        backHref="/incidents"
        backLabel="Back to incidents"
        eyebrow="Incident command center"
        title={incident.title}
        subtitle={
          <>
            {incident.siteName ? (
              <Link href={`/sites/${incident.siteId}`} className="font-semibold text-brand-700 hover:text-brand-800">
                {incident.siteName}
              </Link>
            ) : "Site unavailable"}
            <span className="mx-2 text-ink-300">•</span>
            Reported by {incident.reporterName ?? "—"} {timeAgo(incident.createdAt)}
          </>
        }
        badges={<><SlaBadge sla={incident.sla} /><SeverityBadge value={incident.severity} /><StatusBadge value={incident.status} /></>}
        accent={incident.severity === "critical" || incident.sla.state === "overdue" ? "danger" : "brand"}
      />

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
          {error}
        </p>
      )}

      {incident.sla.state === "overdue" && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-800">Response window has passed</p>
            <p className="text-xs text-red-700">
              The deadline was {formatWhen(incident.dueAt)}. Escalate or reassign this incident.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-2 font-display font-semibold text-ink-800">Description</h2>
            <p className="whitespace-pre-wrap text-sm text-ink-600">
              {incident.description || "No description provided."}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <span className="text-ink-500">
                Category: <span className="capitalize text-ink-800">{incident.category}</span>
              </span>
              <span className="text-ink-500">
                Assignee: <span className="text-ink-800">{incident.workerName ?? "Unassigned"}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-ink-500">
                <CalendarClock size={14} className="text-ink-400" /> Deadline:{" "}
                <span className="text-ink-800">{formatWhen(incident.dueAt)}</span>
              </span>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-brand-100 bg-gradient-to-r from-brand-50 to-transparent px-5 py-3">
              <div className="flex items-center gap-2">
                <h2 className="flex items-center gap-2 font-display font-semibold text-ink-800">
                  <Sparkles size={18} className="text-brand-600" /> AI Assistance
                </h2>
                {incident.aiSource && (
                  <Badge
                    className={
                      incident.aiSource === "openrouter"
                        ? "bg-violet-50 text-violet-700 ring-violet-600/20"
                        : "bg-ink-100 text-ink-500 ring-ink-500/20"
                    }
                  >
                    <Cpu size={11} />{" "}
                    {incident.aiSource === "openrouter" ? "OpenRouter AI" : "Heuristic"}
                  </Badge>
                )}
                {(incident.aiStatus === "pending" || incident.aiStatus === "processing") && (
                  <Badge className="bg-amber-50 text-amber-700 ring-amber-600/20">
                    <RefreshCw size={11} className="animate-spin" /> AI analysis pending
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Summary
                    </p>
                    <p className="mt-0.5 text-ink-700">{incident.aiSummary}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                        Suggested severity
                      </p>
                      <div className="mt-1">
                        <SeverityBadge value={incident.aiSeverity ?? "medium"} />
                      </div>
                    </div>
                    {incident.aiRecommendedRole && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                          Recommended role
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-ink-700">
                          <UserCheck size={14} className="text-brand-500" />
                          {incident.aiRecommendedRole}
                        </p>
                      </div>
                    )}
                    {incident.aiResponseWindow && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                          Response window
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-ink-700">
                          <Clock size={14} className="text-brand-500" />
                          {incident.aiResponseWindow}
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Suggested action
                    </p>
                    <p className="mt-0.5 text-ink-700">{incident.aiSuggestedAction}</p>
                  </div>
                </div>
              ) : incident.aiStatus === "failed" ? (
                <p className="text-sm text-red-500">AI analysis failed. An admin can retry it.</p>
              ) : (
                <p className="text-sm text-ink-400">AI analysis is pending.</p>
              )}
            </div>
          </Card>

          <Checklist
            incidentId={id}
            canEdit={canWork}
            onChange={() => setPulse((value) => value + 1)}
          />

          <CommentThread
            incidentId={id}
            currentUserId={userId}
            isAdmin={isAdmin}
            canPost={canWork}
            onChange={() => setPulse((value) => value + 1)}
          />
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
                    onChange={(e) =>
                      update({ assignedTo: e.target.value ? Number(e.target.value) : null })
                    }
                    disabled={busy}
                  >
                    <option value="">Unassigned</option>
                    {workers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} — {w.role}
                        {incident.aiRecommendedRole && w.role === incident.aiRecommendedRole
                          ? "  ★ recommended"
                          : ""}
                      </option>
                    ))}
                  </Select>
                  {incident.aiRecommendedRole && (
                    <p className="mt-1 text-xs text-ink-400">
                      AI recommends a{" "}
                      <span className="font-medium text-ink-600">{incident.aiRecommendedRole}</span>{" "}
                      for this incident.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={incident.status}
                    onChange={(e) => update({ status: e.target.value })}
                    disabled={busy}
                  >
                    <option value="open">Open</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                  </Select>
                </div>
                <div>
                  <Label>Severity</Label>
                  <Select
                    value={incident.severity}
                    onChange={(e) => update({ severity: e.target.value })}
                    disabled={busy}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </Select>
                  <p className="mt-1 text-xs text-ink-400">
                    Changing severity recalculates the response deadline.
                  </p>
                </div>
                <div>
                  <Label>Response deadline</Label>
                  <Input
                    type="datetime-local"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                    disabled={busy}
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1 text-xs"
                      disabled={busy || !due || due === toLocalInput(incident.dueAt)}
                      onClick={() => update({ dueAt: new Date(due).toISOString() })}
                    >
                      <CalendarClock size={14} /> Save deadline
                    </Button>
                    {incident.dueAt && (
                      <Button
                        variant="ghost"
                        className="text-xs"
                        disabled={busy}
                        onClick={() => update({ dueAt: null })}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Resolution note</Label>
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button
                    className="mt-2 w-full"
                    onClick={() => update({ resolutionNote: note, status: "resolved" })}
                    disabled={busy}
                  >
                    Save &amp; resolve
                  </Button>
                </div>
                <Button variant="ghost" className="w-full text-red-600" onClick={remove} disabled={busy || deleting}>
                  <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete incident"}
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-5 text-sm text-ink-500">
              Only admins can assign, reschedule or resolve incidents. You can still add comments and
              tick off checklist steps if this job is yours.
            </Card>
          )}

          {incident.resolutionNote && (
            <Card className="p-5">
              <h2 className="mb-1 font-display font-semibold text-ink-800">Resolution</h2>
              <p className="whitespace-pre-wrap text-sm text-ink-600">{incident.resolutionNote}</p>
              {incident.resolvedAt && (
                <p className="mt-1 text-xs text-ink-400">
                  Resolved {formatWhen(incident.resolvedAt)}
                </p>
              )}
            </Card>
          )}

          <Timeline incidentId={id} refreshKey={pulse} />
        </div>
      </div>
    </div>
  );
}
