"use client";

import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function DetailHero({
  backHref,
  backLabel,
  eyebrow,
  title,
  subtitle,
  badges,
  accent = "brand",
}: {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  accent?: "brand" | "danger" | "emerald";
}) {
  const theme = {
    brand: "from-brand-50 via-white to-violet-50/80 border-brand-100 text-brand-700",
    danger: "from-red-50 via-white to-orange-50/80 border-red-100 text-red-700",
    emerald: "from-emerald-50 via-white to-teal-50/80 border-emerald-100 text-emerald-700",
  }[accent];

  return (
    <section className={cn("relative isolate overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-[0_14px_38px_-28px_rgba(15,23,42,0.35)] sm:p-6", theme)}>
      <div aria-hidden="true" className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/70 blur-2xl" />
      <div className="relative">
        <Link href={backHref} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-ink-500 transition hover:bg-white/70 hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300">
          <ArrowLeft size={14} /> {backLabel}
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.17em]">
              <Sparkles size={12} aria-hidden="true" /> {eyebrow}
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.045em] text-ink-900 sm:text-3xl">{title}</h1>
            {subtitle && <div className="mt-2 text-sm leading-6 text-ink-600">{subtitle}</div>}
          </div>
          {badges && <div className="flex flex-wrap items-center justify-end gap-2">{badges}</div>}
        </div>
      </div>
    </section>
  );
}
