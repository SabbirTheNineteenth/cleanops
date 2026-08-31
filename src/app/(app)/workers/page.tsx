"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Link2, X } from "lucide-react";
import { getJSON, postJSON, deleteJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { Button, Card, Input, Label, Badge, Select, EmptyState } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";

interface Worker {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: "available" | "assigned" | "off";
}
interface Site {
  id: number;
  name: string;
  code: string;
}
interface Assignment {
  id: number;
  siteId: number;
  workerId: number;
  siteName: string | null;
  workerName: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  assigned: "bg-blue-50 text-blue-700 ring-blue-600/20",
  off: "bg-ink-100 text-ink-500 ring-ink-500/20",
};

export default function WorkersPage() {
  const { isAdmin } = useSession();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<Worker | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "Field Technician" });
  const [siteId, setSiteId] = useState("");
  const [error, setError] = useState("");

  function load() {
    getJSON<{ workers: Worker[] }>("/workers").then((d) => setWorkers(d.workers));
    getJSON<{ sites: Site[] }>("/sites").then((d) => setSites(d.sites));
    getJSON<{ assignments: Assignment[] }>("/assignments").then((d) => setAssignments(d.assignments));
  }
  useEffect(() => {
    load();
  }, []);

  async function createWorker(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await postJSON("/workers", form);
      setAddOpen(false);
      setForm({ name: "", email: "", phone: "", role: "Field Technician" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function removeWorker(id: number) {
    if (!confirm("Delete this worker?")) return;
    await deleteJSON(`/workers/${id}`);
    load();
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignFor || !siteId) return;
    setError("");
    try {
      await postJSON("/assignments", { siteId: Number(siteId), workerId: assignFor.id });
      setSiteId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function unassign(id: number) {
    await deleteJSON(`/assignments/${id}`);
    load();
  }

  const workerAssignments = (id: number) => assignments.filter((a) => a.workerId === id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team"
        title="Workers"
        subtitle="Field staff and their site assignments."
        action={
          isAdmin && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Add worker
            </Button>
          )
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {workers.map((w) => {
          const wa = workerAssignments(w.id);
          return (
            <Card key={w.id} className="p-5 transition hover:shadow-pop">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
                    {w.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-ink-900">{w.name}</p>
                    <p className="text-sm text-ink-500">{w.role}</p>
                    <p className="mt-1 text-xs text-ink-400">{w.email} · {w.phone || "no phone"}</p>
                  </div>
                </div>
                <Badge className={STATUS_STYLE[w.status]}>{w.status}</Badge>
              </div>

              <div className="mt-3 border-t border-ink-100 pt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Assigned sites
                </p>
                {wa.length === 0 ? (
                  <p className="text-sm text-ink-400">Not assigned to any site.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {wa.map((a) => (
                      <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
                        {a.siteName}
                        {isAdmin && (
                          <button onClick={() => unassign(a.id)} className="hover:text-red-600">
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" className="text-xs" onClick={() => { setAssignFor(w); setError(""); }}>
                    <Link2 size={14} /> Assign
                  </Button>
                  <Button variant="ghost" className="text-xs text-red-600" onClick={() => removeWorker(w.id)}>
                    <Trash2 size={14} /> Delete
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
        {workers.length === 0 && (
          <div className="md:col-span-2">
            <Card>
              <EmptyState icon={<Plus size={20} />} title="No workers yet" hint={isAdmin ? "Add field staff to start assigning them to sites." : "No workers have been added yet."} />
            </Card>
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add worker">
        <form onSubmit={createWorker} className="space-y-4">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>Role</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!assignFor} onClose={() => setAssignFor(null)} title={`Assign ${assignFor?.name ?? ""}`}>
        <form onSubmit={assign} className="space-y-4">
          <div>
            <Label>Site</Label>
            <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
              <option value="">Select a site…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </Select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAssignFor(null)}>Close</Button>
            <Button type="submit">Assign</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
