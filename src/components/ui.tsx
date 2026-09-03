"use client";
import clsx from "clsx";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-ink-200/70 bg-white shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const styles = {
    primary:
      "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
    secondary:
      "bg-white text-ink-700 border border-ink-200 shadow-sm hover:bg-ink-50 hover:border-ink-300",
    ghost: "text-ink-600 hover:bg-ink-100",
    danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  }[variant];
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-150 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const fieldBase =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 shadow-sm outline-none transition placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-100";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(fieldBase, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(fieldBase, "resize-y", className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(fieldBase, "cursor-pointer", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-500">
      {children}
    </label>
  );
}

export const SEVERITY_HEX: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  medium: "bg-amber-50 text-amber-700 ring-amber-600/20",
  high: "bg-orange-50 text-orange-700 ring-orange-600/20",
  critical: "bg-red-50 text-red-700 ring-red-600/20",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-ink-100 text-ink-600 ring-ink-500/20",
  assigned: "bg-blue-50 text-blue-700 ring-blue-600/20",
  in_progress: "bg-violet-50 text-violet-700 ring-violet-600/20",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ value }: { value: string }) {
  return (
    <Badge className={SEVERITY_STYLES[value] ?? SEVERITY_STYLES.medium}>
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: SEVERITY_HEX[value] ?? SEVERITY_HEX.medium }}
      />
      {value}
    </Badge>
  );
}

export function StatusBadge({ value }: { value: string }) {
  return (
    <Badge className={STATUS_STYLES[value] ?? STATUS_STYLES.open}>
      {value.replace("_", " ")}
    </Badge>
  );
}

const TONE_STYLES: Record<string, string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warn: "bg-amber-50 text-amber-700 ring-amber-600/20",
  bad: "bg-red-50 text-red-700 ring-red-600/20",
  neutral: "bg-ink-100 text-ink-600 ring-ink-500/20",
};

export function SlaBadge({
  sla,
  className,
}: {
  sla?: { label: string; tone?: string; state?: string } | null;
  className?: string;
}) {
  if (!sla || sla.state === "none") return <span className="text-xs text-ink-400">—</span>;
  return (
    <Badge className={clsx(TONE_STYLES[sla.tone ?? "neutral"], "normal-case", className)}>
      {sla.label}
    </Badge>
  );
}

export function Tone({
  tone = "neutral",
  children,
  className,
}: {
  tone?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return <Badge className={clsx(TONE_STYLES[tone], "normal-case", className)}>{children}</Badge>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton rounded-lg", className)} />;
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
          {icon}
        </div>
      )}
      <div>
        <p className="font-semibold text-ink-700">{title}</p>
        {hint && <p className="mt-0.5 text-sm text-ink-400">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
