"use client";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Sparkles, ClipboardList, Undo2 } from "lucide-react";
import { getJSON, postJSON } from "@/lib/api";
import { useList } from "@/lib/useList";
import { timeAgo } from "@/lib/time";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  Textarea,
  SeverityBadge,
  StatusBadge,
  SlaBadge,
  EmptyState,
  SEVERITY_HEX,
} from "@/components/ui";
import { FilterSelect, ListToolbar, Pagination, SortHeader, TableShell } from "@/components/list";
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
  dueAt: string | null;
  createdAt: string;
  sla: { label: string; tone: string; state: string };
}

interface Option {
  id: number;
  name: string;
  code?: string;
  role?: string;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

const SEVERITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const SLA_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due soon" },
  { value: "breached", label: "SLA breached" },
  { value: "met", label: "SLA met" },
];

export default function IncidentsPage() {
  return (
    <Suspense fallback={null}>
      <IncidentsInner />
    </Suspense>
  );
}

function IncidentsInner() {
  const searchParams = useSearchParams();
  const [sites, setSites] = useState<Option[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "general",
    siteId: "",
    severity: "medium",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preEnhance, setPreEnhance] = useState<string | null>(null);

  const list = useList<Incident>("/incidents", {
    pageSize: 10,
    sort: "createdAt",
    dir: "desc",
    filters: {
      status: searchParams.get("status") ?? "",
      severity: searchParams.get("severity") ?? "",
      sla: searchParams.get("sla") ?? "",
      siteId: searchParams.get("siteId") ?? "",
    },
  });

  useEffect(() => {
    getJSON<{ sites: Option[]; categories: string[] }>("/incidents/meta")
      .then((d) => {
        setSites(d.sites ?? []);
        setCategories(d.categories ?? []);
      })
      .catch(() => undefined);
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
    setError("");
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
      list.refresh();
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
      <Card className="overflow-hidden">
        <ListToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search title, description, site or assignee…"
          exportUrl={list.exportUrl}
          onReset={list.clearFilters}
          activeFilters={list.activeFilters}
        >
          <FilterSelect
            label="All statuses"
            value={list.filters.status ?? ""}
            onChange={(v) => list.setFilter("status", v)}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="All severities"
            value={list.filters.severity ?? ""}
            onChange={(v) => list.setFilter("severity", v)}
            options={SEVERITY_OPTIONS}
          />
          <FilterSelect
            label="Any SLA"
            value={list.filters.sla ?? ""}
            onChange={(v) => list.setFilter("sla", v)}
            options={SLA_OPTIONS}
          />
          <FilterSelect
            label="All sites"
            value={list.filters.siteId ?? ""}
            onChange={(v) => list.setFilter("siteId", v)}
            options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          />
          <FilterSelect
            label="All categories"
            value={list.filters.category ?? ""}
            onChange={(v) => list.setFilter("category", v)}
            options={categories.map((c) => ({ value: c, label: c }))}
          />
        </ListToolbar>
        <TableShell
          head={
            <tr>
              <SortHeader label="Incident" sortKey="title" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <SortHeader label="Site" sortKey="siteName" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <SortHeader label="Severity" sortKey="severity" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <SortHeader label="Status" sortKey="status" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <SortHeader label="SLA" sortKey="dueAt" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <th className="px-4 py-3 text-left">Assignee</th>
              <SortHeader label="Reported" sortKey="createdAt" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
            </tr>
          }
        >
          {list.rows.map((i) => (
            <tr key={i.id} className="group transition hover:bg-ink-50/60">
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
                  <Link href={`/sites/${i.siteId}`} className="hover:text-brand-700">
                    {i.siteName}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3">
                <SeverityBadge value={i.severity} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge value={i.status} />
              </td>
              <td className="px-4 py-3">
                <SlaBadge sla={i.sla} />
              </td>
              <td className="px-4 py-3 text-ink-600">{i.workerName ?? "Unassigned"}</td>
              <td className="px-4 py-3 text-xs text-ink-500">{timeAgo(i.createdAt)}</td>
            </tr>
          ))}
        </TableShell>
        {list.rows.length === 0 && !list.loading && (
          <EmptyState
            icon={<ClipboardList size={20} />}
            title="No incidents match"
            hint={
              list.activeFilters > 0
                ? "Try clearing the filters, or report a new incident."
                : "Report the first incident to get started."
            }
            action={
              list.activeFilters > 0 ? (
                <Button variant="secondary" onClick={list.clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setOpen(true)}>
                  <Plus size={16} /> Report incident
                </Button>
              )
            }
          />
        )}
        {list.error && <p className="px-4 py-3 text-sm text-red-600">{list.error}</p>}
        <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
      </Card>
      <Modal open={open} onClose={closeModal} title="Report incident">
        <form onSubmit={report} className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
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
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Site</Label>
              <Select
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                required
              >
                <option value="">Select…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                list="incident-categories"
              />
              <datalist id="incident-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <Label>Severity (initial guess)</Label>
            <Select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <p className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            <Sparkles size={14} /> AI will generate a summary, severity, due date, and suggested action on submit.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Analyzing…" : "Submit"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
