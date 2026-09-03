"use client";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Sparkles, ClipboardList, Undo2 } from "lucide-react";
import { getJSON, postJSON } from "@/lib/api";
import { Button, Card, Input, Label, Select, Textarea, SeverityBadge, StatusBadge, EmptyState, SEVERITY_HEX } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { AIEditor } from "@/components/ai/AIEditor";

interface Incident {
  id: number;
  title: string;
  severity: string;
  status: string;
  category: string;
  siteId: number;
  siteName: string | null;
  workerName: string | null;
  createdAt: string;
}
interface Site {
  id: number;
  name: string;
  code: string;
}

export default function IncidentsPage() {
  return (
    <Suspense fallback={null}>
      <IncidentsInner />
    </Suspense>
  );
}

function IncidentsInner() {
  const searchParams = useSearchParams();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState(searchParams.get("severity") ?? "");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "general", siteId: "", severity: "medium" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preEnhance, setPreEnhance] = useState<string | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (severityFilter) params.set("severity", severityFilter);
    const qs = params.toString();
    getJSON<{ incidents: Incident[] }>(`/incidents${qs ? `?${qs}` : ""}`).then((d) => setIncidents(d.incidents));
  }
  useEffect(() => {
    load();

  }, [statusFilter, severityFilter]);
  useEffect(() => {
    getJSON<{ sites: Site[] }>("/sites").then((d) => setSites(d.sites));
  }, []);

  function applyAI(text: string) {
    setPreEnhance(form.description);
    setForm((f) => ({ ...f, description: text }));
  }

  function undoEnhance() {
    if (preEnhance === null) return;
    setForm((f) => ({ ...f, description: preEnhance }));
    setPreEnhance(null);
  }

  function closeModal() {
    setOpen(false);
    setPreEnhance(null);
  }

  async function report(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await postJSON("/incidents", { ...form, siteId: Number(form.siteId) });
      setOpen(false);
      setForm({ title: "", description: "", category: "general", siteId: "", severity: "medium" });
      setPreEnhance(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Incidents"
        subtitle="Report, triage, and resolve issues across sites."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> Report incident
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </Select>
        <Select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="w-auto">
          <option value="">All severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3 font-semibold">Incident</th>
              <th className="px-4 py-3 font-semibold">Site</th>
              <th className="px-4 py-3 font-semibold">Severity</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Assignee</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id} className="group border-b border-ink-100 transition last:border-0 hover:bg-ink-50/60">
                <td className="relative py-3 pl-4 pr-4">
                  <span
                    className="absolute left-0 top-0 h-full w-1"
                    style={{ background: SEVERITY_HEX[i.severity] ?? SEVERITY_HEX.medium }}
                  />
                  <Link href={`/incidents/${i.id}`} className="font-medium text-ink-800 hover:text-brand-700">
                    {i.title}
                  </Link>
                  <p className="text-xs capitalize text-ink-400">{i.category}</p>
                </td>
                <td className="px-4 py-3 text-ink-600">
                  {i.siteName ? (
                    <Link href={`/sites/${i.siteId}`} className="hover:text-brand-700">{i.siteName}</Link>
                  ) : "—"}
                </td>
                <td className="px-4 py-3"><SeverityBadge value={i.severity} /></td>
                <td className="px-4 py-3"><StatusBadge value={i.status} /></td>
                <td className="px-4 py-3 text-ink-600">{i.workerName ?? "Unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {incidents.length === 0 && (
          <EmptyState icon={<ClipboardList size={20} />} title="No incidents match" hint="Try clearing the filters, or report a new incident." />
        )}
      </Card>

      <Modal open={open} onClose={closeModal} title="Report incident">
        <form onSubmit={report} className="space-y-4">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
          <div>
            <div className="flex items-end justify-between">
              <Label>Description</Label>
              <div className="mb-1.5 flex items-center gap-1">
                {preEnhance !== null && (
                  <button
                    type="button"
                    onClick={undoEnhance}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
                    title="Restore original text"
                  >
                    <Undo2 size={13} /> Undo
                  </button>
                )}
                <AIEditor
                  value={form.description}
                  onApply={applyAI}
                  context={{
                    title: form.title,
                    category: form.category,
                    siteName: sites.find((s) => String(s.id) === form.siteId)?.name ?? "",
                  }}
                />
              </div>
            </div>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Site</Label>
              <Select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} required>
                <option value="">Select…</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Severity (initial guess)</Label>
            <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </Select>
          </div>
          <p className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            <Sparkles size={14} /> AI will generate a summary, severity, and suggested action on submit.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Analyzing…" : "Submit"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
