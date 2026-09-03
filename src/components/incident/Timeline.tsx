"use client";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  ListChecks,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Sparkles,
  StickyNote,
  UserCheck,
} from "lucide-react";
import { getJSON } from "@/lib/api";
import { formatWhen, timeAgo } from "@/lib/time";
import { Card, Skeleton } from "@/components/ui";

interface Event {
  id: number;
  type: string;
  message: string;
  actorId: number | null;
  actorName: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
}

const STYLES: Record<string, { icon: typeof History; ring: string }> = {
  created: { icon: PlusCircle, ring: "bg-brand-50 text-brand-600 ring-brand-100" },
  ai: { icon: Sparkles, ring: "bg-violet-50 text-violet-600 ring-violet-100" },
  assigned: { icon: UserCheck, ring: "bg-blue-50 text-blue-600 ring-blue-100" },
  severity: { icon: AlertTriangle, ring: "bg-orange-50 text-orange-600 ring-orange-100" },
  status: { icon: RefreshCw, ring: "bg-ink-100 text-ink-600 ring-ink-200" },
  resolved: { icon: CheckCircle2, ring: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  comment: { icon: MessageSquare, ring: "bg-brand-50 text-brand-600 ring-brand-100" },
  task: { icon: ListChecks, ring: "bg-violet-50 text-violet-600 ring-violet-100" },
  note: { icon: StickyNote, ring: "bg-amber-50 text-amber-600 ring-amber-100" },
  due: { icon: Clock, ring: "bg-amber-50 text-amber-600 ring-amber-100" },
};

const FALLBACK = { icon: History, ring: "bg-ink-100 text-ink-500 ring-ink-200" };

export function Timeline({
  incidentId,
  refreshKey = 0,
}: {
  incidentId: string | number;
  refreshKey?: number;
}) {
  const [items, setItems] = useState<Event[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    getJSON<{ data: Event[] }>(`/incidents/${incidentId}/events`)
      .then((d) => setItems(d.data ?? []))
      .catch((e) => setError(e.message));
  }, [incidentId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
        <h2 className="flex items-center gap-2 font-display font-semibold text-ink-800">
          <History size={18} className="text-brand-600" /> Activity
        </h2>
        {items && <span className="text-xs text-ink-400">{items.length} entries</span>}
      </div>
      <div className="px-5 py-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!items && !error ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : items && items.length === 0 ? (
          <p className="text-sm text-ink-400">No activity recorded yet.</p>
        ) : (
          <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-ink-100">
            {(items ?? []).map((item) => {
              const style = STYLES[item.type] ?? FALLBACK;
              const Icon = style.icon;
              return (
                <li key={item.id} className="relative flex gap-3">
                  <span
                    className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${style.ring}`}
                  >
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className="text-sm text-ink-700">{item.message}</p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {item.actorName} · <span title={formatWhen(item.createdAt)}>{timeAgo(item.createdAt)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Card>
  );
}
