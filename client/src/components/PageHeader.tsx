"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_THEMES: Record<string, { surface: string; glow: string; label: string }> = {
  Overview: {
    surface: "from-brand-50 via-white to-violet-50/80 border-brand-100",
    glow: "bg-brand-300/30",
    label: "text-brand-700",
  },
  Operations: {
    surface: "from-sky-50 via-white to-brand-50/70 border-sky-100",
    glow: "bg-sky-300/30",
    label: "text-sky-700",
  },
  Directory: {
    surface: "from-emerald-50 via-white to-teal-50/70 border-emerald-100",
    glow: "bg-emerald-300/30",
    label: "text-emerald-700",
  },
  Team: {
    surface: "from-violet-50 via-white to-fuchsia-50/70 border-violet-100",
    glow: "bg-violet-300/30",
    label: "text-violet-700",
  },
  Administration: {
    surface: "from-amber-50 via-white to-orange-50/70 border-amber-100",
    glow: "bg-amber-300/30",
    label: "text-amber-700",
  },
  Compliance: {
    surface: "from-slate-100 via-white to-indigo-50/70 border-slate-200",
    glow: "bg-indigo-300/25",
    label: "text-slate-700",
  },
  Inbox: {
    surface: "from-cyan-50 via-white to-sky-50/70 border-cyan-100",
    glow: "bg-cyan-300/30",
    label: "text-cyan-700",
  },
  Account: {
    surface: "from-rose-50 via-white to-violet-50/70 border-rose-100",
    glow: "bg-rose-300/25",
    label: "text-rose-700",
  },
  Analytics: {
    surface: "from-indigo-50 via-white to-violet-50/70 border-indigo-100",
    glow: "bg-indigo-300/30",
    label: "text-indigo-700",
  },
  Insights: {
    surface: "from-indigo-50 via-white to-violet-50/70 border-indigo-100",
    glow: "bg-indigo-300/30",
    label: "text-indigo-700",
  },
};

const DEFAULT_THEME = PAGE_THEMES.Overview;

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const theme = (eyebrow && PAGE_THEMES[eyebrow]) || DEFAULT_THEME;

  return (
    <section className={cn("relative isolate overflow-hidden rounded-2xl border bg-gradient-to-br px-5 py-5 shadow-[0_14px_38px_-28px_rgba(15,23,42,0.35)] ring-1 ring-white/75 sm:px-6 sm:py-6", theme.surface)}>
      <div aria-hidden="true" className={cn("absolute -right-10 -top-16 h-44 w-44 rounded-full blur-3xl", theme.glow)} />
      <div aria-hidden="true" className="absolute bottom-0 right-0 h-24 w-1/2 bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.95),transparent_70%)]" />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          {eyebrow && (
            <p className={cn("mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.17em]", theme.label)}>
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/80 shadow-sm ring-1 ring-black/5">
                <Sparkles size={11} aria-hidden="true" />
              </span>
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-3xl font-semibold tracking-[-0.05em] text-ink-900 sm:text-[2.15rem]">{title}</h1>
          {subtitle && <p className="mt-2 max-w-xl text-sm leading-6 text-ink-600">{subtitle}</p>}
        </div>
        {action && <div className="relative flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </section>
  );
}
