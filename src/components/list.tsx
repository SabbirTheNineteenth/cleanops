"use client";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Download, RotateCcw, Search, X } from "lucide-react";
import { Button, Input, Select } from "./ui";
import type { ListMeta } from "@/lib/useList";

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
    <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
      <div className="relative min-w-[200px] flex-1">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="pl-9 pr-8"
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
      {children}
      {activeFilters > 0 && onReset && (
        <Button variant="ghost" onClick={onReset} className="text-xs">
          <RotateCcw size={13} />
          Reset ({activeFilters})
        </Button>
      )}
      {exportUrl && (
        <a
          href={exportUrl}
          className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 shadow-sm transition hover:border-ink-300 hover:bg-ink-50"
        >
          <Download size={14} />
          CSV
        </a>
      )}
    </div>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx("w-auto min-w-[130px] py-2 text-xs", className)}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export function SortSelect({
  sort,
  dir,
  options,
  onChange,
  className,
}: {
  sort: string;
  dir: "asc" | "desc";
  options: { value: string; label: string }[];
  onChange: (sort: string, dir: "asc" | "desc") => void;
  className?: string;
}) {
  const current = `${sort}:${dir}`;
  const known = options.some((option) => option.value === current);
  return (
    <Select
      aria-label="Sort order"
      value={known ? current : options[0]?.value ?? ""}
      onChange={(e) => {
        const [nextSort, nextDir] = e.target.value.split(":");
        onChange(nextSort ?? sort, nextDir === "asc" ? "asc" : "desc");
      }}
      className={clsx("w-auto min-w-[150px] py-2 text-xs", className)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export function SortHeader({
  label,
  sortKey,
  sort,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: string;
  sort: string;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = sort === sortKey;
  return (
    <th className={clsx("px-4 py-3 text-left", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={clsx(
          "inline-flex items-center gap-1 transition",
          active ? "text-brand-700" : "hover:text-ink-700",
        )}
      >
        {label}
        <span className={clsx("text-[10px]", active ? "opacity-100" : "opacity-30")}>
          {active && dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

export function Pagination({
  meta,
  onPage,
  loading,
}: {
  meta: ListMeta;
  onPage: (page: number) => void;
  loading?: boolean;
}) {
  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const end = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
      <p className="text-xs text-ink-500">
        {meta.total === 0 ? "No results" : `Showing ${start}–${end} of ${meta.total}`}
        {loading && <span className="ml-2 text-brand-600">refreshing…</span>}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          className="px-2 py-1.5"
          disabled={!meta.hasPrev}
          onClick={() => onPage(meta.page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </Button>
        <span className="px-2 text-xs font-semibold text-ink-600">
          {meta.page} / {meta.totalPages}
        </span>
        <Button
          variant="secondary"
          className="px-2 py-1.5"
          disabled={!meta.hasNext}
          onClick={() => onPage(meta.page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}

export function TableShell({
  head,
  children,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-ink-100 bg-ink-50/60 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          {head}
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}
