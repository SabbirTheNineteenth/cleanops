"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, ShieldAlert, Lock, UserPlus, UserCheck, X, Clock } from "lucide-react";
import { getJSON, patchJSON, deleteJSON } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import { Button, Card, Badge, EmptyState, Skeleton } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { UserFormModal } from "@/components/admin/UserFormModal";

interface Account {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "banned" | "pending";
  createdAt: string;
}

export default function MembersPage() {
  const { user, isAdmin, loading: sessionLoading } = useSession();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = () =>
    getJSON<{ users: Account[] }>("/users")
      .then((d) => setAccounts(d.users))
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  async function setStatus(id: number, status: "active" | "banned") {
    setBusyId(id);
    setError("");
    try {
      await patchJSON(`/users/${id}`, { status });
      await load();
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
      await load();
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
        subtitle="Manage account access. Ban to revoke sign-in, unban to restore it."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus size={16} /> Add user
          </Button>
        }
      />

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
          {error}
        </p>
      )}

      {accounts && accounts.some((a) => a.status === "pending") && (
        <Card className="overflow-hidden border-amber-200 bg-amber-50/40">
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Clock size={15} />
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Pending approvals ({accounts.filter((a) => a.status === "pending").length})
              </p>
              <p className="text-xs text-amber-700">Approve to activate the account and create a worker profile.</p>
            </div>
          </div>
          <div className="divide-y divide-amber-100">
            {accounts
              .filter((a) => a.status === "pending")
              .map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-sm font-bold text-white">
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-ink-800">{a.name}</p>
                      <p className="text-xs text-ink-400">{a.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button className="text-xs" disabled={busyId === a.id} onClick={() => setStatus(a.id, "active")}>
                      <UserCheck size={14} /> Approve
                    </Button>
                    <Button variant="secondary" className="text-xs" disabled={busyId === a.id} onClick={() => reject(a.id)}>
                      <X size={14} /> Reject
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {!accounts ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={20} />} title="No accounts yet" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/60 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const isSelf = String(a.id) === user?.sub;
                const isTargetAdmin = a.role === "admin";
                const banned = a.status === "banned";
                const pending = a.status === "pending";
                return (
                  <tr key={a.id} className="border-b border-ink-100 transition last:border-0 hover:bg-ink-50/60">
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
                      <Badge className={isTargetAdmin ? "bg-brand-50 text-brand-700 ring-brand-600/20" : "bg-ink-100 text-ink-600 ring-ink-500/20"}>
                        {a.role}
                      </Badge>
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
                    <td className="px-4 py-3 text-right">
                      {pending ? (
                        <span className="text-xs text-amber-600">Awaiting approval</span>
                      ) : isSelf || isTargetAdmin ? (
                        <span className="text-xs text-ink-400">—</span>
                      ) : banned ? (
                        <Button
                          variant="secondary"
                          className="text-xs"
                          disabled={busyId === a.id}
                          onClick={() => setStatus(a.id, "active")}
                        >
                          <ShieldCheck size={14} /> Unban
                        </Button>
                      ) : (
                        <Button
                          variant="danger"
                          className="text-xs"
                          disabled={busyId === a.id}
                          onClick={() => setStatus(a.id, "banned")}
                        >
                          <ShieldOff size={14} /> Ban
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <p className="flex items-center gap-2 text-xs text-ink-400">
        <ShieldAlert size={14} />
        Admin accounts can&apos;t be banned, and you can&apos;t change your own status.
      </p>

      <UserFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={load} />
    </div>
  );
}
