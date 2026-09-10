import test from "node:test";
import assert from "node:assert/strict";
import { asc, desc, sql } from "drizzle-orm";
import type { Context } from "hono";
import {
  DEFAULT_PAGE_SIZE,
  EXPORT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  clampListQuery,
  listMeta,
  optionalId,
  orderFor,
  parseDateRange,
  parseListQuery,
  pickEnum,
  searchPattern,
} from "../src/server/query";

const SORTABLE = ["createdAt", "name", "status"] as const;

function fakeContext(query: Record<string, string>): Context {
  return { req: { query: () => query } } as unknown as Context;
}

function parse(query: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return parseListQuery(fakeContext(query), {
    sortable: SORTABLE,
    defaultSort: "createdAt",
    ...overrides,
  } as Parameters<typeof parseListQuery>[1]);
}

test("an empty query yields first page defaults", () => {
  const q = parse({});
  assert.deepEqual(q, {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    offset: 0,
    q: "",
    sort: "createdAt",
    dir: "desc",
    isExport: false,
  });
});

test("page and pageSize drive the offset", () => {
  assert.equal(parse({ page: "3", pageSize: "25" }).offset, 50);
  assert.equal(parse({ page: "1", pageSize: "25" }).offset, 0);
});

test("page and pageSize are clamped to safe bounds", () => {
  assert.equal(parse({ page: "0" }).page, 1);
  assert.equal(parse({ page: "-9" }).page, 1);
  assert.equal(parse({ pageSize: "0" }).pageSize, 1);
  assert.equal(parse({ pageSize: "9999" }).pageSize, MAX_PAGE_SIZE);
});

test("unparseable numbers fall back instead of producing NaN", () => {
  const q = parse({ page: "abc", pageSize: "" });
  assert.equal(q.page, 1);
  assert.equal(q.pageSize, DEFAULT_PAGE_SIZE);
  assert.equal(q.offset, 0);
});

test("defaultPageSize is honoured when the caller sets one", () => {
  assert.equal(parse({}, { defaultPageSize: 12 }).pageSize, 12);
  assert.equal(parse({ pageSize: "5" }, { defaultPageSize: 12 }).pageSize, 5);
});

test("only whitelisted sort keys are accepted", () => {
  assert.equal(parse({ sort: "name" }).sort, "name");
  assert.equal(parse({ sort: "passwordHash" }).sort, "createdAt");
  assert.equal(parse({ sort: "" }).sort, "createdAt");
});

test("dir accepts asc or desc and otherwise uses the default", () => {
  assert.equal(parse({ dir: "asc" }).dir, "asc");
  assert.equal(parse({ dir: "desc" }).dir, "desc");
  assert.equal(parse({ dir: "sideways" }).dir, "desc");
  assert.equal(parse({ dir: "sideways" }, { defaultDir: "asc" }).dir, "asc");
});

test("the search term is trimmed and capped at 80 characters", () => {
  assert.equal(parse({ q: "  spill  " }).q, "spill");
  assert.equal(parse({ q: "x".repeat(200) }).q.length, 80);
});

test("csv exports reset paging and widen the page size", () => {
  const q = parse({ format: "csv", page: "4", pageSize: "10" });
  assert.equal(q.isExport, true);
  assert.equal(q.pageSize, EXPORT_PAGE_SIZE);
  assert.equal(q.page, 1);
  assert.equal(q.offset, 0);
});

test("listMeta describes an empty result set as a single page", () => {
  const meta = listMeta(parse({}), 0);
  assert.equal(meta.total, 0);
  assert.equal(meta.totalPages, 1);
  assert.equal(meta.page, 1);
  assert.equal(meta.hasPrev, false);
  assert.equal(meta.hasNext, false);
});

test("listMeta counts pages and flags neighbours", () => {
  const meta = listMeta(parse({ page: "2", pageSize: "10" }), 25);
  assert.equal(meta.totalPages, 3);
  assert.equal(meta.page, 2);
  assert.equal(meta.hasPrev, true);
  assert.equal(meta.hasNext, true);
});

test("listMeta clamps a page past the end back to the last page", () => {
  const meta = listMeta(parse({ page: "9", pageSize: "10" }), 25);
  assert.equal(meta.page, 3);
  assert.equal(meta.hasNext, false);
  assert.equal(meta.hasPrev, true);
});

test("clampListQuery makes an out-of-range request query the actual final page", () => {
  const query = clampListQuery(parse({ page: "9", pageSize: "10" }), 25);
  assert.equal(query.page, 3);
  assert.equal(query.offset, 20);
  assert.deepEqual(listMeta(query, 25), {
    page: 3,
    pageSize: 10,
    total: 25,
    totalPages: 3,
    hasPrev: true,
    hasNext: false,
    sort: "createdAt",
    dir: "desc",
    q: "",
  });
});

test("listMeta echoes the sort, dir and search back to the client", () => {
  const meta = listMeta(parse({ sort: "name", dir: "asc", q: " leak " }), 3);
  assert.equal(meta.sort, "name");
  assert.equal(meta.dir, "asc");
  assert.equal(meta.q, "leak");
});

test("searchPattern wraps the term and strips LIKE wildcards", () => {
  assert.equal(searchPattern("leak"), "%leak%");
  assert.equal(searchPattern("100%_off"), "%100off%");
  assert.equal(searchPattern("back\\slash"), "%backslash%");
  assert.equal(searchPattern(""), "%%");
});

test("orderFor maps the direction onto drizzle asc and desc", () => {
  const column = sql.raw("created_at");
  assert.deepEqual(orderFor(column, "asc"), asc(column));
  assert.deepEqual(orderFor(column, "desc"), desc(column));
  assert.notDeepEqual(orderFor(column, "asc"), orderFor(column, "desc"));
});

test("optionalId only accepts positive integers", () => {
  assert.equal(optionalId("12"), 12);
  assert.equal(optionalId("0"), null);
  assert.equal(optionalId("-3"), null);
  assert.equal(optionalId("abc"), null);
  assert.equal(optionalId(undefined), null);
});

test("pickEnum keeps allowed values and drops everything else", () => {
  const allowed = ["open", "resolved"] as const;
  assert.equal(pickEnum("open", allowed), "open");
  assert.equal(pickEnum("deleted", allowed), null);
  assert.equal(pickEnum(undefined, allowed), null);
  assert.equal(pickEnum("", allowed), null);
});

test("parseDateRange defaults to a trailing window that ends today", () => {
  const range = parseDateRange(fakeContext({}));
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(range.to, `${today} 23:59:59`);
  assert.equal(range.days, 30);
  assert.match(range.from, /^\d{4}-\d{2}-\d{2} 00:00:00$/);
});

test("parseDateRange honours explicit from and to dates", () => {
  const range = parseDateRange(fakeContext({ from: "2026-03-01", to: "2026-03-07" }));
  assert.equal(range.from, "2026-03-01 00:00:00");
  assert.equal(range.to, "2026-03-07 23:59:59");
  assert.equal(range.days, 7);
});

test("parseDateRange derives from when only days and to are given", () => {
  const range = parseDateRange(fakeContext({ to: "2026-03-10", days: "3" }));
  assert.equal(range.from, "2026-03-08 00:00:00");
  assert.equal(range.days, 3);
});

test("parseDateRange clamps days and rejects malformed dates", () => {
  assert.equal(parseDateRange(fakeContext({ to: "2026-03-10", days: "9999" })).days, 365);
  assert.equal(parseDateRange(fakeContext({ to: "2026-03-10", days: "0" })).days, 1);
  assert.throws(
    () => parseDateRange(fakeContext({ from: "05-03-2026", to: "2026-03-10", days: "2" })),
    /valid calendar date/,
  );
});

test("parseDateRange accepts a caller supplied fallback window", () => {
  assert.equal(parseDateRange(fakeContext({ to: "2026-03-10" }), 7).days, 7);
});

test("parseDateRange rejects impossible and reversed calendar dates", () => {
  assert.throws(
    () => parseDateRange(fakeContext({ from: "2026-02-30", to: "2026-03-10" })),
    /valid calendar date/,
  );
  assert.throws(
    () => parseDateRange(fakeContext({ from: "2026-03-10", to: "2026-03-01" })),
    /on or before/,
  );
});
