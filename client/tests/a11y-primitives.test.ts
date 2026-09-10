import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ui = readFileSync("src/components/ui.tsx", "utf8");
const modal = readFileSync("src/components/Modal.tsx", "utf8");

test("shared labels accept htmlFor associations", () => {
  assert.match(ui, /LabelHTMLAttributes<HTMLLabelElement>/);
  assert.match(ui, /htmlFor=\{controlId\}/);
  assert.match(ui, /control\.id = generatedId/);
});

test("shared modal provides an accessible keyboard-contained dialog", () => {
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby=/);
  assert.match(modal, /trapFocus/);
  assert.match(modal, /previousFocus/);
  assert.match(modal, /onKeyDown/);
});
