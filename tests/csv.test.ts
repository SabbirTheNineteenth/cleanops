import test from "node:test";
import assert from "node:assert/strict";
import type { Context } from "hono";
import { csvResponse, stamped, toCsv } from "../src/server/csv";

const BOM = "﻿";

interface Captured {
  body: string;
  status: number;
  headers: Record<string, string>;
}

function capturingContext(sink: Partial<Captured>): Context {
  return {
    body: (body: string, status: number, headers: Record<string, string>) => {
      sink.body = body;
      sink.status = status;
      sink.headers = headers;
      return sink;
    },
  } as unknown as Context;
}

test("toCsv starts with a BOM and ends every line with CRLF", () => {
  assert.equal(toCsv(["A", "B"], [[1, 2]]), `${BOM}A,B\r\n1,2\r\n`);
});

test("toCsv writes a header only file when there are no rows", () => {
  assert.equal(toCsv(["ID", "Name"], []), `${BOM}ID,Name\r\n`);
});

test("values containing a comma, quote or semicolon are quoted", () => {
  const csv = toCsv(["A"], [["Dhaka, Bangladesh"], ['He said "hi"'], ["a;b"]]);
  const lines = csv.replace(BOM, "").trimEnd().split("\r\n");
  assert.deepEqual(lines, ["A", '"Dhaka, Bangladesh"', '"He said ""hi"""', '"a;b"']);
});

test("newlines are flattened so a value never breaks the row", () => {
  const csv = toCsv(["Note"], [["first line\nsecond line\r\nthird"]]);
  assert.equal(csv, `${BOM}Note\r\nfirst line second line third\r\n`);
});

test("empty and missing values render as empty cells", () => {
  assert.equal(toCsv(["A", "B", "C"], [[null, undefined, "  "]]), `${BOM}A,B,C\r\n,,\r\n`);
});

test("values that look like formulas are neutralised", () => {
  const csv = toCsv(["A"], [["=SUM(A1:A9)"], ["+1"], ["-1"], ["@cmd"], ["a=b"]]);
  const lines = csv.replace(BOM, "").trimEnd().split("\r\n");
  assert.deepEqual(lines, ["A", "'=SUM(A1:A9)", "'+1", "'-1", "'@cmd", "a=b"]);
});

test("a neutralised formula that also needs quoting gets both", () => {
  assert.equal(toCsv(["A"], [["=1,2"]]), `${BOM}A\r\n"'=1,2"\r\n`);
});

test("headers go through the same escaping as cells", () => {
  assert.equal(toCsv(["Site, code"], [["x"]]), `${BOM}"Site, code"\r\nx\r\n`);
});

test("numbers and booleans are stringified", () => {
  assert.equal(toCsv(["A", "B", "C"], [[0, false, 12.5]]), `${BOM}A,B,C\r\n0,false,12.5\r\n`);
});

test("stamped appends today's date and a csv extension", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(stamped("members"), `members-${today}.csv`);
});

test("csvResponse sets download headers and blocks caching", () => {
  const sink: Partial<Captured> = {};
  csvResponse(capturingContext(sink), "members-2026-03-05.csv", "a,b\r\n");
  assert.equal(sink.status, 200);
  assert.equal(sink.body, "a,b\r\n");
  assert.equal(sink.headers?.["Content-Type"], "text/csv; charset=utf-8");
  assert.equal(
    sink.headers?.["Content-Disposition"],
    'attachment; filename="members-2026-03-05.csv"',
  );
  assert.equal(sink.headers?.["Cache-Control"], "no-store");
});

test("csvResponse strips anything unsafe from the filename", () => {
  const sink: Partial<Captured> = {};
  csvResponse(capturingContext(sink), '../../etc/pa ss"wd.csv', "x\r\n");
  assert.equal(
    sink.headers?.["Content-Disposition"],
    'attachment; filename="..-..-etc-pa-ss-wd.csv"',
  );
});
