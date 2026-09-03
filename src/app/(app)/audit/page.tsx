"use client";
import { useEffect, useState } from "react";
import { Lock, ScrollText, ShieldCheck } from "lucide-react";
import { getJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { useList } from "@/lib/useList";
import { formatWhen, timeAgo } from "@/lib/time";
import { Badge, Card, EmptyState, Skeleton, Tone } from "@/components/ui";
import { FilterSelect, ListToolbar, Pagination, SortHeader, TableShell } from "@/components/list";
import { PageHeader } from "@/components/PageHeader";

interface AuditRow {
  id: number;
  actorId: number | null;
  actorEmail: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: number | null;
  detail: string;
  ip: string;
  userAgent: string;
  createdAt: string;
}

interface AuditMeta {
  actions: string[];
  entities: string[];
  actors: { id: number; name: string; email: string }[];
}

const ACTION_TONES: Record<string, string> = {
  login: "good",
  logout: "neutral",
  login_failed: "bad",
  delete: "bad",
  ban: "bad",
  create: "good",
  approve: "good",
  update: "warn",
  export: "neutral",
  password_change: "warn",
};

export default function AuditPage() {
  const { isAdmin, loading: sessionLoading } = useSession();
  const [meta, setMeta] = useState<AuditMeta | null>(null);
  const list = useList<AuditRow>("/audit", {
    pageSize: 25,
    sort: "createdAt",
    dir: "desc",
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!isAdmin) return;
    getJSON<AuditMeta>("/audit/meta")
      .then(setMeta)
      .catch(() => undefined);
  }, [isAdmin]);

  if (sessionLoading) return <Skeleton className="h-40" />;

  if (!isAdmin) {
    return (
      <Card>
        <EmptyState
          icon={<Lock size={20} />}
          title="Admins only"
          hint="The audit trail is restricted to administrators."
        />
      </Card>
    );
  }

  const actionOptions = (meta?.actions ?? []).map((value) => ({
    value,
    label: value.replace(/_/g, " "),
  }));
  const entityOptions = (meta?.entities ?? []).map((value) => ({ value, label: value }));
  const actorOptions = (meta?.actors ?? []).map((actor) => ({
    value: String(actor.id),
    label: actor.name,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance"
        title="Audit log"
        subtitle="Every privileged action, login attempt and export, with actor and IP."
        action={
          <Tone tone="neutral">
            <ShieldCheck size={13} /> admin only
          </Tone>
        }
      />

      <Card className="overflow-hidden">
        <ListToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search actor, action, entity, detail or IP…"
          onReset={list.clearFilters}
          activeFilters={list.activeFilters}
          exportUrl={list.exportUrl}
        >
          <FilterSelect
            label="All actions"
            value={list.filters.action ?? ""}
            onChange={(value) => list.setFilter("action", value)}
            options={actionOptions}
          />
          <FilterSelect
            label="All entities"
            value={list.filters.entity ?? ""}
            onChange={(value) => list.setFilter("entity", value)}
            options={entityOptions}
          />
          <FilterSelect
            label="All actors"
            value={list.filters.actorId ?? ""}
            onChange={(value) => list.setFilter("actorId", value)}
            options={actorOptions}
          />
          <input
            type="date"
            aria-label="From date"
            value={list.filters.from ?? ""}
            onChange={(e) => list.setFilter("from", e.target.value)}
            className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          />
          <input
            type="date"
            aria-label="To date"
            value={list.filters.to ?? ""}
            onChange={(e) => list.setFilter("to", e.target.value)}
            className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 shadow-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          />
        </ListToolbar>

        {list.loading && list.rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : list.rows.length === 0 ? (
          <EmptyState
            icon={<ScrollText size={20} />}
            title={list.activeFilters > 0 ? "Nothing matches" : "No activity recorded yet"}
            hint={
              list.activeFilters > 0
                ? "Try a wider date range or clear the filters."
                : "Logins, approvals, edits and exports will show up here."
            }
          />
        ) : (
          <TableShell
            head={
              <tr>
                <SortHeader
                  label="When"
                  sortKey="createdAt"
                  sort={list.sort}
                  dir={list.dir}
                  onSort={list.toggleSort}
                />
                <th className="px-4 py-3 text-left">Actor</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Target</th>
                <th className="px-4 py-3 text-left">Detail</th>
                <th className="px-4 py-3 text-left">IP</th>
              </tr>
            }
          >
            {list.rows.map((row) => (
              <tr key={row.id} className="align-top transition hover:bg-ink-50/60">
                <td className="whitespace-nowrap px-4 py-3">
                  <p className="text-sm font-medium text-ink-800">{formatWhen(row.createdAt)}</p>
                  <p className="text-xs text-ink-400">{timeAgo(row.createdAt)}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-ink-800">{row.actorName ?? "System"}</p>
                  <p className="text-xs text-ink-400">{row.actorEmail || "—"}</p>
                </td>
                <td className="px-4 py-3">
                  <Tone tone={ACTION_TONES[row.action] ?? "neutral"}>
                    {row.action.replace(/_/g, " ")}
                  </Tone>
                </td>
                <td className="px-4 py-3">
                  <Badge className="bg-ink-100 text-ink-600 ring-ink-500/20">{row.entity}</Badge>
                  {row.entityId !== null && (
                    <p className="tnum mt-1 text-xs text-ink-400">#{row.entityId}</p>
                  )}
                </td>
                <td className="max-w-[280px] px-4 py-3 text-sm text-ink-600">
                  {row.detail || "—"}
                </td>
                <td className="px-4 py-3 text-xs text-ink-500">{row.ip || "—"}</td>
              </tr>
            ))}
          </TableShell>
        )}

        {list.error && <p className="px-4 py-3 text-sm text-red-600">{list.error}</p>}
        <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
      </Card>
    </div>
  );
}
