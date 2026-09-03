"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  CheckCheck,
  Info,
  Languages,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { postJSON } from "@/lib/api";

type Mode = "style" | "translate" | "fix";

interface EnhanceResult {
  text: string;
  source: "openrouter" | "heuristic" | "unavailable";
  mode: Mode;
  label: string;
}

interface Option {
  id: string;
  label: string;
  icon: string;
}

const TABS: { id: Mode; label: string; icon: React.ReactNode }[] = [
  { id: "translate", label: "Translate", icon: <Languages size={15} /> },
  { id: "style", label: "Style", icon: <Wand2 size={15} /> },
  { id: "fix", label: "Fix", icon: <CheckCheck size={15} /> },
];

const STYLE_OPTIONS: Option[] = [
  { id: "formal", label: "Formal", icon: "\u{1F91D}" },
  { id: "short", label: "Short", icon: "\u{1F3AF}" },
  { id: "detailed", label: "Detailed", icon: "\u{1F50D}" },
  { id: "corporate", label: "Corp", icon: "\u{1F4BC}" },
  { id: "simple", label: "Simple", icon: "\u{1F4AC}" },
  { id: "urgent", label: "Urgent", icon: "\u{1F6A8}" },
];

const LANGUAGE_OPTIONS: Option[] = [
  { id: "english", label: "English", icon: "EN" },
  { id: "bangla", label: "Bangla", icon: "BN" },
  { id: "hindi", label: "Hindi", icon: "HI" },
  { id: "arabic", label: "Arabic", icon: "AR" },
];

export function AIEditor({
  value,
  onApply,
  context,
}: {
  value: string;
  onApply: (text: string) => void;
  context?: { title?: string; category?: string; siteName?: string };
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("style");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [applied, setApplied] = useState<{ option: string; text: string } | null>(
    null,
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeOption = applied && applied.text === value ? applied.option : null;
  const options =
    mode === "style"
      ? STYLE_OPTIONS
      : mode === "translate"
        ? LANGUAGE_OPTIONS
        : [];

  async function run(option: string) {
    if (value.trim().length < 3) {
      setNote({ text: "Write a few words in the description first.", warn: true });
      return;
    }
    setBusy(option);
    setNote(null);
    try {
      const res = await postJSON<EnhanceResult>("/incidents/enhance", {
        text: value,
        mode,
        preset: mode === "style" ? option : undefined,
        language: mode === "translate" ? option : undefined,
        title: context?.title ?? "",
        category: context?.category ?? "",
        siteName: context?.siteName ?? "",
      });

      if (res.source === "unavailable") {
        setNote({
          text: "Translation needs OPENROUTER_API_KEY on the server.",
          warn: true,
        });
        return;
      }

      onApply(res.text);
      setApplied({ option, text: res.text });
      setNote(
        res.source === "openrouter"
          ? { text: `Applied — ${res.label}`, warn: false }
          : {
              text: `${res.label}: cleaned up locally (AI key not configured)`,
              warn: true,
            },
      );
    } catch (err) {
      setNote({
        text: err instanceof Error ? err.message : "Could not reach the AI service",
        warn: true,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition",
          open
            ? "bg-brand-600 text-white shadow-sm"
            : "bg-brand-50 text-brand-700 hover:bg-brand-100",
        )}
        title="Open the AI editor"
      >
        <Sparkles size={13} /> Enhance with AI
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[21rem] max-w-[calc(100vw-3rem)] animate-fade-up rounded-2xl border border-white/10 bg-rail-900 p-3 shadow-pop">
          <div className="mb-3 flex items-center justify-between pl-1">
            <h4 className="font-display text-base font-semibold text-white">
              AI Editor
            </h4>
            <div className="flex items-center gap-0.5">
              <span
                className="cursor-help rounded-md p-1 text-ink-500 transition hover:text-ink-300"
                title="The AI keeps your facts and never invents new ones. Undo restores your original text."
              >
                <Info size={15} />
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-ink-500 transition hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-full bg-rail-950/80 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setMode(t.id);
                  setNote(null);
                }}
                className={clsx(
                  "flex flex-1 flex-col items-center gap-1 rounded-full px-2 py-2 text-[11px] font-semibold transition",
                  mode === t.id
                    ? "bg-white/10 text-brand-300 ring-1 ring-inset ring-brand-500/30"
                    : "text-ink-500 hover:bg-white/5 hover:text-ink-200",
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-2 rounded-xl bg-rail-950/60 p-1.5">
            {mode === "fix" ? (
              <button
                type="button"
                onClick={() => run("grammar")}
                disabled={busy !== null}
                className={clsx(
                  "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition disabled:opacity-60",
                  activeOption === "grammar"
                    ? "bg-white/10 text-brand-300 ring-1 ring-inset ring-brand-500/30"
                    : "text-ink-300 hover:bg-white/5 hover:text-white",
                )}
              >
                {busy ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <CheckCheck size={15} />
                )}
                Fix grammar &amp; spelling
              </button>
            ) : (
              <div
                className={clsx(
                  "grid gap-1",
                  mode === "style" ? "grid-cols-3" : "grid-cols-4",
                )}
              >
                {options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => run(o.id)}
                    disabled={busy !== null}
                    className={clsx(
                      "flex flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold transition disabled:opacity-60",
                      activeOption === o.id
                        ? "bg-white/10 text-brand-300 ring-1 ring-inset ring-brand-500/30"
                        : "text-ink-300 hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {busy === o.id ? (
                      <Loader2 size={17} className="animate-spin text-brand-300" />
                    ) : (
                      <span
                        className={
                          mode === "style"
                            ? "text-lg leading-none"
                            : "text-sm font-bold leading-none tracking-wider text-brand-300/90"
                        }
                      >
                        {o.icon}
                      </span>
                    )}
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <p
            className={clsx(
              "mt-2 px-1 text-[11px] leading-relaxed",
              note
                ? note.warn
                  ? "text-amber-300"
                  : "text-emerald-300"
                : "text-ink-500",
            )}
          >
            {note
              ? note.text
              : mode === "translate"
                ? "Pick a language — the description is translated in place."
                : "Pick an action — the description is rewritten instantly."}
          </p>
        </div>
      )}
    </div>
  );
}
