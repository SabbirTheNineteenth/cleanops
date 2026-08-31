"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, MapPin, Pencil } from "lucide-react";
import { getJSON, deleteJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { Button, Card, Badge, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { SiteFormModal, type SiteRecord } from "@/components/admin/SiteFormModal";

export default function SitesPage() {
  const { isAdmin } = useSession();
  const [sites, setSites] = useState<SiteRecord[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SiteRecord | null>(null);

  const load = () => getJSON<{ sites: SiteRecord[] }>("/sites").then((d) => setSites(d.sites));
  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(site: SiteRecord) {
    setEditing(site);
    setModalOpen(true);
  }

  async function remove(id: number) {
    if (!confirm("Delete this site? This also removes its assignments and incidents.")) return;
    await deleteJSON(`/sites/${id}`);
    load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Directory"
        title="Sites"
        subtitle="Client locations under management."
        action={
          isAdmin && (
            <Button onClick={openCreate}>
              <Plus size={16} /> Add site
            </Button>
          )
        }
      />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              {isAdmin && <th className="px-4 py-3 text-right font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} className="border-b border-ink-100 transition last:border-0 hover:bg-ink-50/60">
                <td className="px-4 py-3 font-medium text-ink-800">{s.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-600">{s.code}</td>
                <td className="px-4 py-3 text-ink-600">
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={14} className="text-ink-400" />
                    {s.location || "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge className={s.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-ink-100 text-ink-500 ring-ink-500/20"}>
                    {s.status}
                  </Badge>
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(s)} className="rounded-md p-1.5 text-ink-400 transition hover:bg-brand-50 hover:text-brand-600" title="Edit">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => remove(s.id)} className="rounded-md p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {sites.length === 0 && (
          <EmptyState icon={<MapPin size={20} />} title="No sites yet" hint={isAdmin ? "Add your first client location to get started." : "No locations have been added yet."} />
        )}
      </Card>

      {isAdmin && (
        <SiteFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} site={editing} />
      )}
    </div>
  );
}
