"use client";
import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { deleteJSON, getJSON, postJSON } from "@/lib/api";
import { timeAgo } from "@/lib/time";
import { Badge, Button, Card, Skeleton, Textarea } from "@/components/ui";

interface Comment {
  id: number;
  body: string;
  authorId: number;
  authorName: string;
  authorRole: string | null;
  createdAt: string;
}

const PAGE = 20;

export function CommentThread({
  incidentId,
  currentUserId,
  isAdmin,
  canPost = true,
  onChange,
}: {
  incidentId: string | number;
  currentUserId: number | null;
  isAdmin: boolean;
  canPost?: boolean;
  onChange?: () => void;
}) {
  const [items, setItems] = useState<Comment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [size, setSize] = useState(PAGE);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (pageSize: number) =>
      getJSON<{ data: Comment[]; meta: { total: number } }>(
        `/incidents/${incidentId}/comments?dir=desc&pageSize=${pageSize}`,
      )
        .then((d) => {
          setItems((d.data ?? []).slice().reverse());
          setTotal(d.meta?.total ?? 0);
        })
        .catch((e) => setError(e.message)),
    [incidentId],
  );

  useEffect(() => {
    load(size);
  }, [load, size]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (text.length < 2) {
      setError("Write at least 2 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await postJSON(`/incidents/${incidentId}/comments`, { body: text });
      setBody("");
      await load(size);
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this comment?")) return;
    setError("");
    try {
      await deleteJSON(`/incidents/${incidentId}/comments/${id}`);
      await load(size);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete comment");
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
        <h2 className="flex items-center gap-2 font-display font-semibold text-ink-800">
          <MessageSquare size={18} className="text-brand-600" /> Discussion
        </h2>
        <span className="text-xs text-ink-400">{total} comment{total === 1 ? "" : "s"}</span>
      </div>

      <div className="space-y-3 px-5 py-4">
        {!items ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-2 text-sm text-ink-400">
            No comments yet. Ask a question or leave an update for the crew.
          </p>
        ) : (
          <>
            {total > items.length && (
              <button
                type="button"
                onClick={() => setSize((value) => value + PAGE)}
                className="w-full rounded-lg border border-dashed border-ink-200 py-2 text-xs font-semibold text-ink-500 transition hover:border-brand-300 hover:text-brand-700"
              >
                Load {Math.min(PAGE, total - items.length)} older comment
                {Math.min(PAGE, total - items.length) === 1 ? "" : "s"}
              </button>
            )}
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
                    {item.authorName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl border border-ink-100 bg-ink-50/40 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-ink-800">{item.authorName}</p>
                      {item.authorRole === "admin" && (
                        <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">admin</Badge>
                      )}
                      <span className="text-xs text-ink-400">{timeAgo(item.createdAt)}</span>
                      {(isAdmin || item.authorId === currentUserId) && (
                        <button
                          type="button"
                          onClick={() => remove(item.id)}
                          aria-label="Delete comment"
                          className="ml-auto rounded p-1 text-ink-300 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-600">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {canPost ? (
        <form onSubmit={submit} className="border-t border-ink-100 bg-ink-50/40 px-5 py-4">
          <Textarea
            rows={3}
            value={body}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add an update, a question, or a handover note…"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-ink-400">{body.length}/2000</span>
            <Button type="submit" disabled={busy || body.trim().length < 2}>
              <Send size={14} /> {busy ? "Posting…" : "Post comment"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="border-t border-ink-100 bg-ink-50/40 px-5 py-3 text-xs text-ink-400">
          Read-only — only an admin, the reporter, or the assigned worker can post here.
        </p>
      )}
    </Card>
  );
}
