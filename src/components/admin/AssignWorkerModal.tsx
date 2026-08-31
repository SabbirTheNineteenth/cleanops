"use client";
import { useEffect, useState } from "react";
import { getJSON, postJSON } from "@/lib/api";
import { Button, Label, Select } from "@/components/ui";
import { Modal } from "@/components/Modal";

interface WorkerLite {
  id: number;
  name: string;
  role: string;
}
interface SiteLite {
  id: number;
  name: string;
  code: string;
}

export function AssignWorkerModal({
  open,
  onClose,
  onSaved,
  fixedWorkerId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  fixedWorkerId?: number;
  title?: string;
}) {
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [sites, setSites] = useState<SiteLite[]>([]);
  const [workerId, setWorkerId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSiteId("");
    setWorkerId(fixedWorkerId ? String(fixedWorkerId) : "");
    getJSON<{ workers: WorkerLite[] }>("/workers").then((d) => setWorkers(d.workers));
    getJSON<{ sites: SiteLite[] }>("/sites").then((d) => setSites(d.sites));
  }, [open, fixedWorkerId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!workerId || !siteId) return;
    setError("");
    setSaving(true);
    try {
      await postJSON("/assignments", { siteId: Number(siteId), workerId: Number(workerId) });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title ?? "Assign worker"}>
      <form onSubmit={submit} className="space-y-4">
        {!fixedWorkerId && (
          <div>
            <Label>Worker</Label>
            <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)} required>
              <option value="">Select a worker…</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>{w.name} — {w.role}</option>
              ))}
            </Select>
          </div>
        )}
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
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Assigning…" : "Assign"}</Button>
        </div>
      </form>
    </Modal>
  );
}
