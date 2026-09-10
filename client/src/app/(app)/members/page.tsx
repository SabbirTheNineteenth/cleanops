"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Clock,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { patchJSON, deleteJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { useList } from "@/lib/useList";
import { Button, Card, Badge, EmptyState, Select, Skeleton, Tone } from "@/components/ui";
import { FilterSelect, ListContext, ListToolbar, Pagination, SortHeader, TableShell } from "@/components/list";
import { PageHeader } from "@/components/PageHeader";
import { UserFormModal } from "@/components/admin/UserFormModal";
import { ResetPasswordModal } from "@/components/admin/ResetPasswordModal";

interface Account {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "banned" | "pending";
  createdAt: string;
  workerId: number | null;
  workerRole: string | null;
}

interface Summary {
  summary: { pending: number; banned: number; admins: number };
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "banned", label: "Banned" },
];

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
];

export default function MembersPage() {
  const { user, isAdmin, loading: sessionLoading } = useSession();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<Account | null>(null);
  const [notice, setNotice] = useState("");

  const list = useList<Account, Summary>("/users", {
    pageSize: 12,
    sort: "createdAt",
    dir: "desc",
    enabled: isAdmin,
  });
  const summary = list.extra?.summary;

  async function patch(id: number, body: Record<string, string>) {
    setBusyId(id);
    setError("");
    try {
      await patchJSON(`/users/${id}`, body);
      list.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: number) {
    if (!confirm("Reject and remove this registration? This cannot be undone.")) return;
    setBusyId(id);
    setError("");
    try {
      await deleteJSON(`/users/${id}`);
      list.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  if (sessionLoading) return <Skeleton className="h-40" />;

  if (!isAdmin) {
    return (
      <Card>
        <EmptyState
          icon={<Lock size={20} />}
          title="Admins only"
          hint="You don't have permission to manage member accounts."
        />
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Members"
        subtitle="Approve registrations, manage roles, and revoke access."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus size={16} /> Add user
          </Button>
        }
      />

      <ListContext
        label="Access registry"
        description="Keep account status, approval flow, and role coverage visible at a glance."
        meta={list.meta}
        activeFilters={list.activeFilters}
        loading={list.loading}
      />

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
          {error}
        </p>
      )}

      {notice && (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
          <KeyRound size={15} />
          {notice}
        </p>
      )}

      {summary && summary.pending > 0 && list.filters.status !== "pending" && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Clock size={15} />
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {summary.pending} registration{summary.pending === 1 ? "" : "s"} awaiting approval
              </p>
              <p className="text-xs text-amber-700">
                Approving activates the account and creates a worker profile.
              </p>
            </div>
          </div>
          <Button variant="secondary" className="text-xs" onClick={() => list.setFilter("status", "pending")}>
            Review now
          </Button>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Tone tone="neutral">{list.meta.total} total</Tone>
        {summary && <Tone tone="warn">{summary.pending} pending</Tone>}
        {summary && <Tone tone="bad">{summary.banned} banned</Tone>}
        {summary && <Tone tone="good">{summary.admins} admins</Tone>}
      </div>
      <Card className="overflow-hidden">
        <ListToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search name or email…"
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
            options={ROLE_OPTIONS}
          />
        </ListToolbar>

        <TableShell
          head={
            <tr>
              <SortHeader label="Member" sortKey="name" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <SortHeader label="Role" sortKey="role" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <SortHeader label="Status" sortKey="status" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <th className="px-4 py-3 text-left">Worker</th>
              <SortHeader label="Joined" sortKey="createdAt" sort={list.sort} dir={list.dir} onSort={list.toggleSort} />
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          }
        >
          {list.rows.map((a) => {
            const isSelf = String(a.id) === user?.sub;
            const banned = a.status === "banned";
            const pending = a.status === "pending";
            return (
              <tr key={a.id} className="transition hover:bg-ink-50/60">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-ink-800">
                        {a.name} {isSelf && <span className="text-xs text-ink-400">(you)</span>}
                      </p>
                      <p className="text-xs text-ink-400">{a.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {isSelf ? (
                    <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{a.role}</Badge>
                  ) : (
                    <Select
                      aria-label={`Role for ${a.name}`}
                      className="w-auto py-1.5 text-xs"
                      value={a.role}
                      disabled={busyId === a.id || pending}
                      onChange={(e) => patch(a.id, { role: e.target.value })}
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    className={
                      pending
                        ? "bg-amber-50 text-amber-700 ring-amber-600/20"
                        : banned
                          ? "bg-red-50 text-red-700 ring-red-600/20"
                          : "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    }
                  >
                    {a.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-ink-500">
                  {a.workerId ? (
                    <Link href={`/incidents?workerId=${a.workerId}`} className="hover:text-brand-700">
                      {a.workerRole ?? "worker"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-ink-500">{a.createdAt.slice(0, 10)}</td>
                <td className="px-4 py-3 text-right">
                  {pending ? (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        className="text-xs"
                        disabled={busyId === a.id}
                        onClick={() => patch(a.id, { status: "active" })}
                      >
                        <UserCheck size={14} /> Approve
                      </Button>
                      <Button
                        variant="secondary"
                        className="text-xs"
                        disabled={busyId === a.id}
                        onClick={() => reject(a.id)}
                      >
                        <X size={14} /> Reject
                      </Button>
                    </div>
                  ) : isSelf || a.role === "admin" ? (
                    <span className="text-xs text-ink-400">—</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        className="text-xs"
                        disabled={busyId === a.id}
                        onClick={() => {
                          setNotice("");
                          setResetTarget(a);
                        }}
                      >
                        <KeyRound size={14} /> Reset
                      </Button>
                      {banned ? (
                        <Button
                          variant="secondary"
                          className="text-xs"
                          disabled={busyId === a.id}
                          onClick={() => patch(a.id, { status: "active" })}
                        >
                          <ShieldCheck size={14} /> Unban
                        </Button>
                      ) : (
                        <Button
                          variant="danger"
                          className="text-xs"
                          disabled={busyId === a.id}
                          onClick={() => patch(a.id, { status: "banned" })}
                        >
                          <ShieldOff size={14} /> Ban
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </TableShell>
        {list.loading && list.rows.length === 0 && (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        )}
        {!list.loading && list.rows.length === 0 && (
          <EmptyState
            icon={<ShieldCheck size={20} />}
            title="No accounts match"
            hint={list.activeFilters > 0 ? "Try clearing the search or filters." : undefined}
            action={
              list.activeFilters > 0 ? (
                <Button variant="secondary" onClick={list.clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
        {list.error && <p className="px-4 py-3 text-sm text-red-600">{list.error}</p>}
        <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
      </Card>

      <p className="flex items-center gap-2 text-xs text-ink-400">
        <ShieldAlert size={14} />
        Admin accounts can&apos;t be banned or password-reset here, you can&apos;t change your own
        access, and the last active admin can&apos;t be demoted.
      </p>

      <UserFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={list.refresh} />
      <ResetPasswordModal
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onSaved={() => {
          setNotice(
            `Password reset for ${resetTarget?.name ?? "the member"} — their sessions were signed out.`,
          );
          list.refresh();
        }}
      />
    </div>
  );
}
