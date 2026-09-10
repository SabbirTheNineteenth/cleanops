import test from "node:test";
import assert from "node:assert/strict";
import { validateIncidentTransition } from "../src/server/workflow";

function errorOf(result: ReturnType<typeof validateIncidentTransition>): string {
  if (result.ok) throw new Error("Expected transition to be rejected");
  return result.error;
}

test("incident workflow only allows forward transitions", () => {
  assert.deepEqual(validateIncidentTransition("open", "assigned", { assignedTo: 4 }), { ok: true });
  assert.deepEqual(validateIncidentTransition("assigned", "in_progress", { assignedTo: 4 }), { ok: true });
  assert.deepEqual(
    validateIncidentTransition("in_progress", "resolved", { assignedTo: 4, resolutionNote: "Area cleaned and dried." }),
    { ok: true },
  );
  assert.match(errorOf(validateIncidentTransition("open", "resolved", { assignedTo: 4, resolutionNote: "Done" })), /open/);
  assert.match(errorOf(validateIncidentTransition("resolved", "in_progress", { assignedTo: 4 })), /resolved/);
});

test("incident workflow requires an assignee before work and a resolution note before closure", () => {
  assert.match(errorOf(validateIncidentTransition("assigned", "in_progress", {})), /assignee/);
  assert.match(errorOf(validateIncidentTransition("in_progress", "resolved", { assignedTo: 4 })), /resolution note/);
});
