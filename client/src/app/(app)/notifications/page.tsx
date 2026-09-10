"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellOff,
  CheckCheck,
  Inbox,
  MessageSquare,
  ShieldCheck,
  Trash2,
  UserCheck,
  Wrench,
} from "lucide-react";
import { deleteJSON, postJSON } from "@/lib/api";
import { useList } from "@/lib/useList";
import { timeAgo } from "@/lib/time";
import { Button, Card, EmptyState, Skeleton, Tone } from "@/components/ui";
import { FilterSelect, ListContext, ListToolbar, Pagination, SortSelect } from "@/components/list";
import { PageHeader } from "@/components/PageHeader";

interface Note {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  read: boolean;
  createdAt: string;
}

const READ_OPTIONS = [{ value: "1", label: "Unread only" }];

const TYPE_OPTIONS = [
  { value: "comment", label: "Comments" },
  { value: "assignment", label: "Assignments" },
  { value: "resolved", label: "Resolved" },
  { value: "approval", label: "Approvals" },
  { value: "security", label: "Security" },
  { value: "info", label: "General" },
];

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
];

const ICONS: Record<string, { icon: typeof Bell; tone: string }> = {
  comment: { icon: MessageSquare, tone: "bg-brand-50 text-brand-600" },
  assignment: { icon: Wrench, tone: "bg-blue-50 text-blue-600" },
  resolved: { icon: CheckCheck, tone: "bg-emerald-50 text-emerald-600" },
  approval: { icon: UserCheck, tone: "bg-amber-50 text-amber-600" },
  security: { icon: ShieldCheck, tone: "bg-red-50 text-red-600" },
};

export default function NotificationsPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useList<Note, { unread: number }>("/notifications", { pageSize: 15 });
  const unread = list.extra?.unread ?? 0;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      list.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        subtitle="Assignments, comments and approvals that need your eyes."
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy || unread === 0}
              onClick={() => run(() => postJSON("/notifications/read", {}))}
            >
              <CheckCheck size={16} /> Mark all read
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => run(() => deleteJSON("/notifications/read"))}
            >
              <Trash2 size={16} /> Clear read
            </Button>
          </div>
        }
      />

      <ListContext
        label="Priority inbox"
        description="Stay ahead of assignments, approvals, and activity that needs acknowledgement."
        meta={list.meta}
        activeFilters={list.activeFilters}
        loading={list.loading}
      />

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <Tone tone="neutral">{list.meta.total} total</Tone>
        <Tone tone={unread > 0 ? "warn" : "good"}>{unread} unread</Tone>
      </div>

      <Card className="overflow-hidden">
        <ListToolbar
          search={list.search}
          onSearch={list.setSearch}
          placeholder="Search notifications…"
          onReset={list.clearFilters}
          activeFilters={list.activeFilters}
        >
          <FilterSelect
            label="All states"
            value={list.filters.unread ?? ""}
            onChange={(v) => list.setFilter("unread", v)}
            options={READ_OPTIONS}
          />
          <FilterSelect
            label="All types"
            value={list.filters.type ?? ""}
            onChange={(v) => list.setFilter("type", v)}
            options={TYPE_OPTIONS}
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

        {list.loading && list.rows.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : list.rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={20} />}
            title={list.activeFilters > 0 ? "Nothing matches" : "You are all caught up"}
            hint={
              list.activeFilters > 0
                ? "Try clearing the search or filters."
                : "New assignments and comments will land here."
            }
            action={
              list.activeFilters > 0 ? (
                <Button variant="secondary" onClick={list.clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {list.rows.map((note) => {
              const style = ICONS[note.type] ?? { icon: Bell, tone: "bg-ink-100 text-ink-500" };
              const Icon = style.icon;
              return (
                <li
                  key={note.id}
                  className={`flex items-start gap-3 px-4 py-3 transition ${
                    note.read ? "bg-white" : "bg-brand-50/40"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.tone}`}
                  >
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm ${
                          note.read ? "font-medium text-ink-700" : "font-semibold text-ink-900"
                        }`}
                      >
                        {note.title}
                      </p>
                      {!note.read && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                      <span className="text-xs text-ink-400">{timeAgo(note.createdAt)}</span>
                    </div>
                    {note.body && <p className="mt-0.5 text-sm text-ink-500">{note.body}</p>}
                    {note.link && (
                      <Link
                        href={note.link}
                        onClick={() =>
                          note.read
                            ? undefined
                            : run(() => postJSON("/notifications/read", { ids: [note.id] }))
                        }
                        className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
                      >
                        Open →
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!note.read && (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label="Mark as read"
                        onClick={() => run(() => postJSON("/notifications/read", { ids: [note.id] }))}
                        className="rounded p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-brand-700"
                      >
                        <BellOff size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label="Delete notification"
                      onClick={() => run(() => deleteJSON(`/notifications/${note.id}`))}
                      className="rounded p-1.5 text-ink-300 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {list.error && <p className="px-4 py-3 text-sm text-red-600">{list.error}</p>}
        <Pagination meta={list.meta} onPage={list.setPage} loading={list.loading} />
      </Card>
    </div>
  );
}
