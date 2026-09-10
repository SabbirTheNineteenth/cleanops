"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, MapPin, Pencil, Plus, Trash2, Users } from "lucide-react";
import { deleteJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { useList } from "@/lib/useList";
import { Button, Card, Badge, EmptyState, Tone } from "@/components/ui";
import { FilterSelect, ListContext, ListLoadingSkeleton, ListToolbar, Pagination, SortHeader, TableShell } from "@/components/list";
import { PageHeader } from "@/components/PageHeader";
import { SiteFormModal, type SiteRecord } from "@/components/admin/SiteFormModal";

interface SiteRow extends SiteRecord {
  openIncidents: number;
  totalIncidents: number;
  crewSize: number;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default function SitesPage() {
  const { isAdmin } = useSession();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SiteRecord | null>(null);
  const [error, setError] = useState("");

  const list = useList<SiteRow>("/sites", { pageSize: 10, sort: "name", dir: "asc" });

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(site: SiteRow) {
    setEditing(site);
    setModalOpen(true);
  }

  async function remove(site: SiteRow) {
    if (!confirm(`Delete ${site.name}? Its assignments and incident history go with it.`)) return;
    setError("");
    try {
      await deleteJSON(`/sites/${site.id}`);
      list.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
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
      <ListContext
        label="Site portfolio"
        description="Monitor the locations, staffing, and open work that define service coverage."
        meta={list.meta}
        activeFilters={list.activeFilters}
        loading={list.loading}
      />

      <Card className="overflow-hidden">
        <ListToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search name, code or location…"
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
        </ListToolbar>
        <TableShell
          head={
            <tr>
              <SortHeader label="Name" sortKey="name" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <SortHeader label="Code" sortKey="code" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <th className="px-4 py-3 text-left">Location</th>
              <th className="px-4 py-3 text-left">Crew</th>
              <SortHeader label="Open" sortKey="openIncidents" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <SortHeader label="Status" sortKey="status" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          }
        >
          {list.rows.map((s) => (
            <tr key={s.id} className="transition hover:bg-ink-50/60">
              <td className="px-4 py-3 font-medium text-ink-800">
                <Link href={`/sites/${s.id}`} className="hover:text-brand-700">
                  {s.name}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-ink-600">{s.code}</td>
              <td className="px-4 py-3 text-ink-600">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={14} className="text-ink-400" />
                  {s.location || "—"}
                </span>
              </td>
              <td className="px-4 py-3 text-ink-600">
                <span className="inline-flex items-center gap-1 text-xs">
                  <Users size={13} className="text-ink-400" />
                  {s.crewSize}
                </span>
              </td>
              <td className="px-4 py-3">
                {s.openIncidents > 0 ? (
                  <Link href={`/incidents?siteId=${s.id}&status=open`}>
                    <Tone tone={s.openIncidents > 2 ? "bad" : "warn"}>
                      <AlertTriangle size={12} /> {s.openIncidents} open
                    </Tone>
                  </Link>
                ) : (
                  <span className="text-xs text-ink-400">Clear</span>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge
                  className={
                    s.status === "active"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                      : "bg-ink-100 text-ink-500 ring-ink-500/20"
                  }
                >
                  {s.status}
                </Badge>
              </td>
              {isAdmin && (
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEdit(s)}
                      className="rounded-md p-1.5 text-ink-400 transition hover:bg-brand-50 hover:text-brand-600"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => remove(s)}
                      className="rounded-md p-1.5 text-ink-400 transition hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </TableShell>
        {list.loading && list.rows.length === 0 && <ListLoadingSkeleton rows={6} />}
        {list.rows.length === 0 && !list.loading && (
          <EmptyState
            icon={<MapPin size={20} />}
            title="No sites match"
            hint={
              list.activeFilters > 0
                ? "Try clearing the search or filters."
                : isAdmin
                  ? "Add your first client location to get started."
                  : "No locations have been added yet."
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
          <p className="px-4 py-3 text-sm text-red-600">{error || list.error}</p>
        )}
        <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
      </Card>

      {isAdmin && (
        <SiteFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={list.refresh}
          site={editing}
        />
      )}
    </div>
  );
}
