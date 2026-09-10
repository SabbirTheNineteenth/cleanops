"use client";
import { useCallback, useEffect, useReducer, useState } from "react";
import { getJSON, resolveApiUrl } from "./api";

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

export interface ListState {
  page: number;
  search: string;
  term: string;
  sort: string;
  dir: "asc" | "desc";
  filters: Record<string, string>;
}

type ListStateAction =
  | { type: "page"; value: number }
  | { type: "search"; value: string }
  | { type: "term"; value: string }
  | { type: "sort"; sort: string; dir: "asc" | "desc" }
  | { type: "dir"; value: "asc" | "desc" }
  | { type: "filter"; key: string; value: string }
  | { type: "clearFilters" };

export function reduceListState(state: ListState, action: ListStateAction): ListState {
  switch (action.type) {
    case "page":
      return { ...state, page: Math.max(1, action.value) };
    case "search":
      return { ...state, search: action.value };
    case "term":
      return { ...state, page: 1, term: action.value };
    case "sort":
      return { ...state, page: 1, sort: action.sort, dir: action.dir };
    case "dir":
      return { ...state, page: 1, dir: action.value };
    case "filter": {
      if ((state.filters[action.key] ?? "") === action.value) return state;
      const filters = { ...state.filters };
      if (action.value === "") delete filters[action.key];
      else filters[action.key] = action.value;
      return { ...state, page: 1, filters };
    }
    case "clearFilters":
      return { ...state, page: 1, search: "", term: "", filters: {} };
  }
}

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
  const [state, dispatch] = useReducer(reduceListState, {
    page: 1,
    search: "",
    term: "",
    sort: initialSort,
    dir: initialDir,
    filters: options.filters ?? {},
  });
  const { page, search, term, sort, dir, filters } = state;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: "term", value: search.trim() });
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

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

  const setFilter = useCallback((key: string, value: string) => {
    dispatch({ type: "filter", key, value });
  }, []);

  const clearFilters = useCallback(() => {
    dispatch({ type: "clearFilters" });
  }, []);

  const toggleSort = useCallback((key: string) => {
    dispatch({ type: "sort", sort: key, dir: sort === key && dir === "asc" ? "desc" : "asc" });
  }, [dir, sort]);

  const setPage = useCallback((value: number) => dispatch({ type: "page", value }), []);
  const setSearch = useCallback((value: string) => dispatch({ type: "search", value }), []);
  const setSort = useCallback(
    (value: string) => dispatch({ type: "sort", sort: value, dir: value === sort ? dir : "asc" }),
    [dir, sort],
  );
  const setDir = useCallback((value: "asc" | "desc") => dispatch({ type: "dir", value }), []);

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
    exportUrl: resolveApiUrl(`${path}?${buildQuery({ format: "csv" })}`),
  };
}
