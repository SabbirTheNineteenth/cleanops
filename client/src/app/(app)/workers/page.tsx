"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Link2, Plus, Trash2, Users, X } from "lucide-react";
import { getJSON, postJSON, deleteJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { useList } from "@/lib/useList";
import { Button, Card, Input, Label, Badge, EmptyState, Tone } from "@/components/ui";
import { FilterSelect, ListContext, ListToolbar, Pagination, SortSelect } from "@/components/list";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { AssignWorkerModal } from "@/components/admin/AssignWorkerModal";

interface Worker {
  id: number;
  userId: number | null;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: "available" | "assigned" | "off";
  openIncidents: number;
  resolvedIncidents: number;
  siteCount: number;
}

interface Assignment {
  id: number;
  siteId: number;
  workerId: number;
  siteName: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  assigned: "bg-blue-50 text-blue-700 ring-blue-600/20",
  off: "bg-ink-100 text-ink-500 ring-ink-500/20",
};

const STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "assigned", label: "Assigned" },
  { value: "off", label: "Off duty" },
];

const LINK_OPTIONS = [
  { value: "1", label: "Has account" },
  { value: "0", label: "No account" },
];

const SORT_OPTIONS = [
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "openIncidents:desc", label: "Busiest first" },
  { value: "openIncidents:asc", label: "Lightest load" },
  { value: "role:asc", label: "Role A–Z" },
  { value: "createdAt:desc", label: "Newest first" },
];

export default function WorkersPage() {
  const { isAdmin } = useSession();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sites, setSites] = useState<{ id: number; name: string }[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<Worker | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "Field Technician" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const list = useList<Worker>("/workers", { pageSize: 12, sort: "name", dir: "asc" });

  const loadAssignments = useCallback(() => {
    getJSON<{ data: Assignment[] }>("/assignments?pageSize=200")
      .then((d) => setAssignments(d.data ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadAssignments();
    getJSON<{ data: { id: number; name: string }[] }>("/sites?pageSize=200")
      .then((d) => setSites(d.data ?? []))
      .catch(() => undefined);
    getJSON<{ roles: string[] }>("/workers/roles")
      .then((d) => setRoles(d.roles ?? []))
      .catch(() => undefined);
  }, [loadAssignments]);

  function refreshAll() {
    list.refresh();
    loadAssignments();
  }

  async function createWorker(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await postJSON("/workers", form);
      setAddOpen(false);
      setForm({ name: "", email: "", phone: "", role: "Field Technician" });
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }
  async function removeWorker(worker: Worker) {
    if (!confirm(`Delete ${worker.name}?`)) return;
    setError("");
    try {
      await deleteJSON(`/workers/${worker.id}`);
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function unassign(id: number) {
    setError("");
    try {
      await deleteJSON(`/assignments/${id}`);
      refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  const workerAssignments = (id: number) => assignments.filter((a) => a.workerId === id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team"
        title="Workers"
        subtitle="Field staff, workload, and site assignments."
        action={
          isAdmin && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Add worker
            </Button>
          )
        }
      />
      <ListContext
        label="Workforce roster"
        description="Review availability, workload, and site coverage in one operating view."
        meta={list.meta}
        activeFilters={list.activeFilters}
        loading={list.loading}
      />

      <Card className="overflow-hidden">
        <ListToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search name, email, phone or role…"
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
            label="All roles"
            value={list.filters.role ?? ""}
            onChange={(v) => list.setFilter("role", v)}
            options={roles.map((r) => ({ value: r, label: r }))}
          />
          <FilterSelect
            label="All sites"
            value={list.filters.siteId ?? ""}
            onChange={(v) => list.setFilter("siteId", v)}
            options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
          />
          <FilterSelect
            label="Any account"
            value={list.filters.linked ?? ""}
            onChange={(v) => list.setFilter("linked", v)}
            options={LINK_OPTIONS}
          />
          <SortSelect
            sort={list.sort}
            dir={list.dir}
            options={SORT_OPTIONS}
            onChange={(sort, dir) => {
              list.setSort(sort);
              list.setDir(dir);
            }}
          />
        </ListToolbar>
        <div className="grid gap-4 p-4 md:grid-cols-2">
          {list.rows.map((w) => {
            const wa = workerAssignments(w.id);
            return (
              <div
                key={w.id}
                className="rounded-xl border border-ink-200/70 bg-white p-5 shadow-sm transition hover:shadow-pop"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
                      {w.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-ink-900">{w.name}</p>
                      <p className="text-sm text-ink-500">{w.role}</p>
                      <p className="mt-1 text-xs text-ink-400">
                        {w.email} · {w.phone || "no phone"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge className={STATUS_STYLE[w.status]}>{w.status}</Badge>
                    {w.userId ? (
                      <span className="text-[11px] font-semibold text-emerald-600">has account</span>
                    ) : (
                      <span className="text-[11px] text-ink-400">no account</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-100 pt-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-ink-900">{w.openIncidents}</p>
                    <p className="text-[11px] uppercase tracking-wide text-ink-400">Open</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-ink-900">{w.resolvedIncidents}</p>
                    <p className="text-[11px] uppercase tracking-wide text-ink-400">Resolved</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-ink-900">{w.siteCount}</p>
                    <p className="text-[11px] uppercase tracking-wide text-ink-400">Sites</p>
                  </div>
                </div>
                <div className="mt-3 border-t border-ink-100 pt-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                    Assigned sites
                  </p>
                  {wa.length === 0 ? (
                    <p className="text-sm text-ink-400">Not assigned to any site.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {wa.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700"
                        >
                          <Link href={`/sites/${a.siteId}`} className="hover:underline">
                            {a.siteName}
                          </Link>
                          {isAdmin && (
                            <button onClick={() => unassign(a.id)} className="hover:text-red-600" title="Unassign">
                              <X size={12} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
                  {w.openIncidents > 0 ? (
                    <Link href={`/incidents?workerId=${w.id}`}>
                      <Tone tone={w.openIncidents > 2 ? "bad" : "warn"}>{w.openIncidents} active</Tone>
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-400">No open work</span>
                  )}
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button
                        variant="secondary"
                        className="text-xs"
                        onClick={() => {
                          setAssignFor(w);
                          setError("");
                        }}
                      >
                        <Link2 size={14} /> Assign
                      </Button>
                      <Button variant="ghost" className="text-xs text-red-600" onClick={() => removeWorker(w)}>
                        <Trash2 size={14} /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {list.rows.length === 0 && !list.loading && (
          <EmptyState
            icon={<Users size={20} />}
            title="No workers match"
            hint={
              list.activeFilters > 0
                ? "Try clearing the search or filters."
                : isAdmin
                  ? "Add field staff to start assigning them to sites."
                  : "No workers have been added yet."
            }
            action={
              list.activeFilters > 0 ? (
                <Button variant="secondary" onClick={list.clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
        {(error || list.error) && (
          <p className="px-4 pb-3 text-sm text-red-600">{error || list.error}</p>
        )}
        <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
      </Card>
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add worker">
        <form onSubmit={createWorker} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} list="worker-roles" />
            <datalist id="worker-roles">
              {roles.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            If a member account already uses this email, the worker is linked to it automatically.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <AssignWorkerModal
        open={!!assignFor}
        onClose={() => setAssignFor(null)}
        onSaved={refreshAll}
        fixedWorkerId={assignFor?.id}
        title={`Assign ${assignFor?.name ?? ""}`}
      />
    </div>
  );
}
