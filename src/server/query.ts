import { asc, desc, type SQLWrapper } from "drizzle-orm";
import type { Context } from "hono";

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;
export const EXPORT_PAGE_SIZE = 2000;

export type SortDir = "asc" | "desc";

export interface ListQuery {
  page: number;
  pageSize: number;
  offset: number;
  q: string;
  sort: string;
  dir: SortDir;
  isExport: boolean;
}

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  sort: string;
  dir: SortDir;
  q: string;
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseListQuery(
  c: Context,
  options: {
    sortable: readonly string[];
    defaultSort: string;
    defaultDir?: SortDir;
    defaultPageSize?: number;
  },
): ListQuery {
  const raw = c.req.query();
  const isExport = raw.format === "csv";
  const page = Math.max(1, toInt(raw.page, 1));
  const pageSize = isExport
    ? EXPORT_PAGE_SIZE
    : Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(raw.pageSize, options.defaultPageSize ?? DEFAULT_PAGE_SIZE)));
  const sort = options.sortable.includes(String(raw.sort ?? ""))
    ? String(raw.sort)
    : options.defaultSort;
  const dir: SortDir =
    raw.dir === "asc" || raw.dir === "desc" ? raw.dir : options.defaultDir ?? "desc";

  return {
    page: isExport ? 1 : page,
    pageSize,
    offset: isExport ? 0 : (page - 1) * pageSize,
    q: String(raw.q ?? "").trim().slice(0, 80),
    sort,
    dir,
    isExport,
  };
}

export function listMeta(query: ListQuery, total: number): ListMeta {
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);
  return {
    page,
    pageSize: query.pageSize,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    sort: query.sort,
    dir: query.dir,
    q: query.q,
  };
}

export function searchPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, "")}%`;
}

export function orderFor(column: SQLWrapper, dir: SortDir) {
  return dir === "asc" ? asc(column) : desc(column);
}

export function optionalId(value: string | undefined): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function pickEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | null {
  return allowed.includes(String(value ?? "") as T) ? (String(value) as T) : null;
}

export interface DateRange {
  from: string;
  to: string;
  days: number;
}

export function parseDateRange(c: Context, fallbackDays = 30): DateRange {
  const raw = c.req.query();
  const days = Math.min(365, Math.max(1, toInt(raw.days, fallbackDays)));
  const isDate = (value: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));

  const to = isDate(raw.to) ? String(raw.to) : new Date().toISOString().slice(0, 10);
  const fromDefault = new Date(`${to}T00:00:00Z`);
  fromDefault.setUTCDate(fromDefault.getUTCDate() - (days - 1));
  const from = isDate(raw.from) ? String(raw.from) : fromDefault.toISOString().slice(0, 10);

  const spanMs = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return {
    from: `${from} 00:00:00`,
    to: `${to} 23:59:59`,
    days: Math.max(1, Math.round(spanMs / 86_400_000) + 1),
  };
}
