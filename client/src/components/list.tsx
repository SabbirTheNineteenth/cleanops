"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button, Input, Select, Skeleton } from "./ui";
import type { ListMeta } from "@/lib/useList";

type FilterOption = { value: string; label: string };

function FilterMenu({
  children,
  activeFilters = 0,
  onReset,
}: {
  children: React.ReactNode;
  activeFilters?: number;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleReset() {
    onReset?.();
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative z-20">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open filters"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 shadow-sm transition hover:border-brand-200 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
      >
        <SlidersHorizontal size={15} className="text-brand-600" />
        Filters
        {activeFilters > 0 && (
          <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {activeFilters}
          </span>
        )}
        <ChevronDown size={14} className={cn("text-ink-400 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div id={popoverId} className="filter-popover absolute right-0 top-[calc(100%+0.5rem)] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-ink-200 bg-white p-3 shadow-[0_18px_48px_-18px_rgba(15,23,42,0.32)]">
          <div className="mb-3 flex items-center justify-between border-b border-ink-100 pb-2.5">
            <div>
              <p className="text-sm font-semibold text-ink-800">Refine results</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {activeFilters > 0 ? `${activeFilters} filter${activeFilters === 1 ? "" : "s"} applied` : "No filters applied"}
              </p>
            </div>
            {activeFilters > 0 && onReset ? (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
              >
                Clear all filters
              </button>
            ) : (
              <SlidersHorizontal size={16} className="text-brand-500" aria-hidden="true" />
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">{children}</div>
        </div>
      )}
    </div>
  );
}

export function ListToolbar({
  search,
  onSearch,
  placeholder = "Search…",
  children,
  exportUrl,
  onReset,
  activeFilters = 0,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
  exportUrl?: string;
  onReset?: () => void;
  activeFilters?: number;
}) {
  return (
    <div className="list-toolbar flex flex-wrap items-center gap-2 border-b border-ink-100 bg-gradient-to-r from-white via-white to-brand-50/35 px-4 py-3">
      <div className="relative min-w-[200px] flex-1">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder}
          className="h-10 border-ink-200 bg-white pl-9 pr-8"
          aria-label={placeholder}
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearch("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-600"
          >
            <X size={13} />
          </button>
        )}
      </div>
      {children && (
        <FilterMenu activeFilters={activeFilters} onReset={onReset}>
          {children}
        </FilterMenu>
      )}
      {activeFilters > 0 && onReset && (
        <Button variant="ghost" onClick={onReset} className="h-10 px-3 text-xs">
          <RotateCcw size={13} />
          Reset ({activeFilters})
        </Button>
      )}
      {exportUrl && (
        <a
          href={exportUrl}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3.5 text-sm font-semibold text-ink-700 shadow-sm transition hover:border-ink-300 hover:bg-ink-50"
        >
          <Download size={14} />
          CSV
        </a>
      )}
    </div>
  );
}

export function ListContext({
  label,
  description,
  meta,
  activeFilters = 0,
  loading = false,
}: {
  label: string;
  description: string;
  meta: ListMeta;
  activeFilters?: number;
  loading?: boolean;
}) {
  return (
    <section className="panel-enter data-surface flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink-200/80 bg-white/80 px-4 py-3 shadow-[0_12px_30px_-25px_rgba(15,23,42,.28)] backdrop-blur-sm sm:px-5">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">{label}</p>
        <p className="mt-1 text-sm font-medium text-ink-700">{description}</p>
      </div>
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className="rounded-full bg-ink-100 px-2.5 py-1.5 text-ink-600">{loading ? "Refreshing" : `${meta.total} records`}</span>
        {activeFilters > 0 && <span className="rounded-full bg-brand-50 px-2.5 py-1.5 text-brand-700">{activeFilters} filter{activeFilters === 1 ? "" : "s"}</span>}
      </div>
    </section>
  );
}

export function FilterSelect({ value, onChange, options, label, className }: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  label: string;
  className?: string;
}) {
  const fieldLabel = label.replace(/^(All|Any)\s+/i, "");
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">{fieldLabel}</span>
      <Select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn("h-10 w-full border-ink-200 bg-ink-50/50 py-2 text-sm", className)}
      >
        <option value="">{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
    </label>
  );
}

export function SortSelect({ sort, dir, options, onChange, className }: {
  sort: string;
  dir: "asc" | "desc";
  options: FilterOption[];
  onChange: (sort: string, dir: "asc" | "desc") => void;
  className?: string;
}) {
  const current = `${sort}:${dir}`;
  const known = options.some((option) => option.value === current);
  return (
    <Select
      aria-label="Sort order"
      value={known ? current : options[0]?.value ?? ""}
      onChange={(event) => {
        const [nextSort, nextDir] = event.target.value.split(":");
        onChange(nextSort ?? sort, nextDir === "asc" ? "asc" : "desc");
      }}
      className={cn("h-10 w-auto min-w-[150px] border-ink-200 py-2 text-xs", className)}
    >
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </Select>
  );
}

export function SortHeader({ label, sortKey, sort, dir, onSort, className }: {
  label: string;
  sortKey: string;
  sort: string;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = sort === sortKey;
  return (
    <th className={cn("px-4 py-3 text-left", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 transition", active ? "text-brand-700" : "hover:text-ink-700")}
      >
        {label}
        <span className={cn("text-[10px]", active ? "opacity-100" : "opacity-30")}>{active && dir === "asc" ? "▲" : "▼"}</span>
      </button>
    </th>
  );
}

export function Pagination({ meta, onPage, loading }: { meta: ListMeta; onPage: (page: number) => void; loading?: boolean }) {
  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const end = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
      <p className="text-xs text-ink-500">
        {meta.total === 0 ? "No results" : `Showing ${start}–${end} of ${meta.total}`}
        {loading && <span className="ml-2 text-brand-600">refreshing…</span>}
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" className="px-2 py-1.5" disabled={!meta.hasPrev} onClick={() => onPage(meta.page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></Button>
        <span className="px-2 text-xs font-semibold text-ink-600">{meta.page} / {meta.totalPages}</span>
        <Button variant="secondary" className="px-2 py-1.5" disabled={!meta.hasNext} onClick={() => onPage(meta.page + 1)} aria-label="Next page"><ChevronRight size={15} /></Button>
      </div>
    </div>
  );
}

export function TableShell({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="table-scroll-shell">
      <p className="table-scroll-hint" aria-hidden="true">Swipe to view details</p>
      <div className="data-table overflow-x-auto" tabIndex={0} aria-label="Scrollable data table">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-ink-100 bg-gradient-to-r from-ink-50/90 to-brand-50/35 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{head}</thead>
          <tbody className="divide-y divide-ink-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function ListLoadingSkeleton({
  variant = "table",
  rows = 5,
}: {
  variant?: "table" | "cards";
  rows?: number;
}) {
  if (variant === "cards") {
    return (
      <div className="grid gap-4 p-4 md:grid-cols-2" aria-label="Loading results" aria-busy="true">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="space-y-4 rounded-xl border border-ink-200/70 bg-white p-5">
            <div className="flex items-start gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div></div>
            <div className="grid grid-cols-3 gap-2 border-t border-ink-100 pt-3">{Array.from({ length: 3 }).map((_, metric) => <Skeleton key={metric} className="h-9" />)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4" aria-label="Loading results" aria-busy="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="grid grid-cols-[minmax(12rem,2fr)_repeat(3,minmax(5rem,1fr))] gap-4 rounded-lg px-2 py-2">
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
          <Skeleton className="h-5" />
        </div>
      ))}
    </div>
  );
}
