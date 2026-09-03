"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getJSON } from "./api";

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  sort: string;
  dir: "asc" | "desc";
  q: string;
}

export interface ListResponse<T> {
  data: T[];
  meta: ListMeta;
}

export interface UseListOptions {
  pageSize?: number;
  sort?: string;
  dir?: "asc" | "desc";
  filters?: Record<string, string>;
  enabled?: boolean;
}

const EMPTY_META: ListMeta = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
  hasPrev: false,
  hasNext: false,
  sort: "",
  dir: "desc",
  q: "",
};

export function useList<T, E = Record<string, unknown>>(
  path: string,
  options: UseListOptions = {},
) {
  const { pageSize = 10, sort: initialSort = "", dir: initialDir = "desc", enabled = true } = options;

  const [rows, setRows] = useState<T[]>([]);
  const [meta, setMeta] = useState<ListMeta>({ ...EMPTY_META, pageSize });
  const [extra, setExtra] = useState<E | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState(initialSort);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const [filters, setFilters] = useState<Record<string, string>>(options.filters ?? {});
  const [tick, setTick] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const filterKey = useMemo(
    () =>
      Object.entries(filters)
        .filter(([, value]) => value !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("&"),
    [filters],
  );

  const buildQuery = useCallback(
    (overrides: Record<string, string> = {}) => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (term) params.set("q", term);
      if (sort) params.set("sort", sort);
      if (dir) params.set("dir", dir);
      for (const [key, value] of Object.entries(filters)) {
        if (value !== "") params.set(key, value);
      }
      for (const [key, value] of Object.entries(overrides)) params.set(key, value);
      return params.toString();
    },
    [page, pageSize, term, sort, dir, filters],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const query = buildQuery();
        const res = await getJSON<ListResponse<T> & E>(`${path}?${query}`);
        if (cancelled) return;
        setRows(res.data ?? []);
        setMeta(res.meta ?? { ...EMPTY_META, pageSize });
        setExtra(res as unknown as E);
        setError("");
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [path, buildQuery, enabled, pageSize, tick]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPage(1);
  }, [filterKey, sort, dir]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((current) => {
      if ((current[key] ?? "") === value) return current;
      const next = { ...current };
      if (value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setSearch("");
    setTerm("");
    setPage(1);
  }, []);

  const toggleSort = useCallback((key: string) => {
    setSort((currentSort) => {
      if (currentSort === key) {
        setDir((currentDir) => (currentDir === "asc" ? "desc" : "asc"));
        return currentSort;
      }
      setDir("asc");
      return key;
    });
  }, []);

  const activeFilters = Object.values(filters).filter((value) => value !== "").length + (term ? 1 : 0);

  return {
    rows,
    meta,
    extra,
    loading,
    error,
    page,
    setPage,
    search,
    setSearch,
    term,
    sort,
    dir,
    setSort,
    setDir,
    toggleSort,
    filters,
    setFilter,
    clearFilters,
    activeFilters,
    refresh: () => setTick((value) => value + 1),
    exportUrl: `/api${path}?${buildQuery({ format: "csv" })}`,
  };
}
