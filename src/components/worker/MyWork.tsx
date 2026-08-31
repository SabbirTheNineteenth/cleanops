"use client";
import { useEffect, useState } from "react";
import { ClipboardList, Wrench, MapPin, CheckCircle2 } from "lucide-react";
import { getJSON, patchJSON } from "@/lib/api";
import { Card, Button, Label, Select, Textarea, SeverityBadge, StatusBadge, EmptyState, Skeleton } from "@/components/ui";
import { Modal } from "@/components/Modal";

interface MyIncident {
  id: number;
  title: string;
  description: string;
  category: string;
  status: "open" | "assigned" | "in_progress" | "resolved";
  severity: string;
  siteName: string | null;
  aiSuggestedAction: string | null;
  resolutionNote: string | null;
  updatedAt: string;
}

export function MyWork() {
  const [items, setItems] = useState<MyIncident[] | null>(null);
  const [active, setActive] = useState<MyIncident | null>(null);
  const [status, setStatus] = useState<"in_progress" | "resolved">("in_progress");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () =>
    getJSON<{ incidents: MyIncident[] }>("/incidents/mine").then((d) => setItems(d.incidents));

  useEffect(() => {
    load();
  }, []);

  function openUpdate(i: MyIncident) {
    setActive(i);
    setStatus(i.status === "resolved" ? "resolved" : "in_progress");
    setNote(i.resolutionNote ?? "");
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!active) return;
    setSaving(true);
    setError("");
    try {
      await patchJSON(`/incidents/${active.id}/work`, { status, resolutionNote: note });
      setActive(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  if (items && items.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <ClipboardList size={16} />
        </span>
        <div>
          <h2 className="font-display font-semibold text-ink-800">My assigned work</h2>
          <p className="text-xs text-ink-400">Incidents assigned to you. Update progress as you go.</p>
        </div>
      </div>

      {!items ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((i) => (
            <div key={i.id} className="rounded-xl border border-ink-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-800">{i.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
                    <MapPin size={12} /> {i.siteName ?? "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SeverityBadge value={i.severity} />
                  <StatusBadge value={i.status} />
                </div>
              </div>

              {i.aiSuggestedAction && (
                <p className="mt-2 rounded-lg bg-brand-50/60 px-3 py-2 text-xs text-brand-800">
                  <span className="font-semibold">Suggested action: </span>
                  {i.aiSuggestedAction}
                </p>
              )}

              {i.resolutionNote && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-500">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                  <span><span className="font-semibold text-ink-600">Work note: </span>{i.resolutionNote}</span>
                </p>
              )}

              <div className="mt-3 flex justify-end">
                <Button variant="secondary" className="text-xs" onClick={() => openUpdate(i)}>
                  <Wrench size={14} /> Update
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!active} onClose={() => setActive(null)} title={active ? `Update: ${active.title}` : "Update"}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as "in_progress" | "resolved")}>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </Select>
          </div>
          <div>
            <Label>Work details / resolution note</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe what you did, parts used, follow-ups needed…"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setActive(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save update"}</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
