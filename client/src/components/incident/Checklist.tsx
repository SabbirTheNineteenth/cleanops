"use client";
import { useCallback, useEffect, useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { deleteJSON, getJSON, patchJSON, postJSON } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { Button, Card, Input, Skeleton } from "@/components/ui";

interface Task {
  id: number;
  title: string;
  done: boolean;
  doneAt: string | null;
  doneBy: number | null;
  doneByName: string | null;
  createdAt: string;
}

interface Progress {
  done: number;
  total: number;
  percent: number;
}

export function Checklist({
  incidentId,
  canEdit,
  onChange,
}: {
  incidentId: string | number;
  canEdit: boolean;
  onChange?: () => void;
}) {
  const [items, setItems] = useState<Task[] | null>(null);
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0, percent: 0 });
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      getJSON<{ data: Task[]; progress: Progress }>(`/incidents/${incidentId}/tasks`)
        .then((d) => {
          setItems(d.data ?? []);
          setProgress(d.progress ?? { done: 0, total: 0, percent: 0 });
        })
        .catch((e) => setError(e.message)),
    [incidentId],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the checklist");
    } finally {
      setBusy(false);
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const text = title.trim();
    if (text.length < 2) return;
    run(async () => {
      await postJSON(`/incidents/${incidentId}/tasks`, { title: text });
      setTitle("");
    });
  }

  const toggle = (task: Task) =>
    run(() => patchJSON(`/incidents/${incidentId}/tasks/${task.id}`, { done: !task.done }));

  const remove = (task: Task) => {
    if (!confirm(`Remove "${task.title}" from the checklist?`)) return;
    run(() => deleteJSON(`/incidents/${incidentId}/tasks/${task.id}`));
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
        <h2 className="flex items-center gap-2 font-display font-semibold text-ink-800">
          <ListChecks size={18} className="text-brand-600" /> Work checklist
        </h2>
        <span className="text-xs font-semibold text-ink-500">
          {progress.done}/{progress.total} done
        </span>
      </div>

      {progress.total > 0 && (
        <div className="h-1.5 w-full bg-ink-100">
          <div
            className="h-full rounded-r-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}

      <div className="px-5 py-4">
        {!items ? (
          <div className="space-y-2">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-400">
            {canEdit
              ? "No steps yet. Break the job into small steps so progress is visible."
              : "No checklist steps have been added yet."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((task) => (
              <li
                key={task.id}
                className="group flex items-start gap-3 rounded-lg px-2 py-1.5 transition hover:bg-ink-50/70"
              >
                <input
                  type="checkbox"
                  checked={task.done}
                  disabled={!canEdit || busy}
                  onChange={() => toggle(task)}
                  aria-label={task.title}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink-300 text-brand-600 focus:ring-brand-300 disabled:cursor-not-allowed"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      task.done
                        ? "text-sm text-ink-400 line-through"
                        : "text-sm text-ink-700"
                    }
                  >
                    {task.title}
                  </p>
                  {task.done && (
                    <p className="text-xs text-ink-400">
                      {task.doneByName ?? "Someone"} · {timeAgo(task.doneAt)}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => remove(task)}
                    aria-label={`Remove ${task.title}`}
                    className="rounded p-1 text-ink-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {canEdit && (
          <form onSubmit={add} className="mt-4 flex gap-2">
            <Input
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a step, e.g. isolate the water supply"
              aria-label="New checklist step"
            />
            <Button type="submit" variant="secondary" disabled={busy || title.trim().length < 2}>
              <Plus size={14} /> Add
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
