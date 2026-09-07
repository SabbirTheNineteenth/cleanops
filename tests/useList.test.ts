import test from "node:test";
import assert from "node:assert/strict";
import { reduceListState, type ListState } from "../src/lib/useList";

const pagedState: ListState = {
  page: 4,
  search: "old search",
  term: "old search",
  sort: "createdAt",
  dir: "desc",
  filters: { status: "open" },
};

test("a filter change resets its request state to page one atomically", () => {
  const next = reduceListState(pagedState, { type: "filter", key: "status", value: "resolved" });
  assert.deepEqual(next, { ...pagedState, page: 1, filters: { status: "resolved" } });
});

test("a debounced search change resets its request state to page one atomically", () => {
  const next = reduceListState(pagedState, { type: "term", value: "new search" });
  assert.deepEqual(next, { ...pagedState, page: 1, term: "new search" });
});

test("a sort change resets its request state to page one atomically", () => {
  const next = reduceListState(pagedState, { type: "sort", sort: "name", dir: "asc" });
  assert.deepEqual(next, { ...pagedState, page: 1, sort: "name", dir: "asc" });
});
