import type { Context } from "hono";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\r?\n/g, " ").trim();
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",;]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function csvResponse(c: Context, filename: string, csv: string) {
  const safe = filename.replace(/[^a-z0-9._-]/gi, "-");
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safe}"`,
    "Cache-Control": "no-store",
  });
}

export function stamped(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}
