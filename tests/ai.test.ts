import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanupModelText,
  coerceSeverity,
  extractJson,
  heuristic,
  recommendRole,
  shorten,
  tidyText,
} from "../src/server/ai";
import { slaMinutes } from "../src/lib/sla";

const ctx = (title: string, description = "", category = "general", siteName?: string) => ({
  title,
  description,
  category,
  siteName,
});

test("coerceSeverity accepts the four levels in any casing", () => {
  assert.equal(coerceSeverity("LOW"), "low");
  assert.equal(coerceSeverity(" High "), "high");
  assert.equal(coerceSeverity("critical"), "critical");
});

test("coerceSeverity falls back to medium for anything else", () => {
  assert.equal(coerceSeverity("urgent"), "medium");
  assert.equal(coerceSeverity(null), "medium");
  assert.equal(coerceSeverity(undefined), "medium");
  assert.equal(coerceSeverity(7), "medium");
});

test("extractJson reads a bare JSON object", () => {
  assert.deepEqual(extractJson('{"severity":"high"}'), { severity: "high" });
});

test("extractJson strips markdown fences", () => {
  assert.deepEqual(extractJson('```json\n{"severity":"low"}\n```'), { severity: "low" });
});

test("extractJson digs the object out of surrounding prose", () => {
  const raw = 'Sure! Here is the analysis:\n{"severity":"critical","summary":"x"}\nHope that helps.';
  assert.deepEqual(extractJson(raw), { severity: "critical", summary: "x" });
});

test("extractJson returns null when there is nothing usable", () => {
  assert.equal(extractJson(""), null);
  assert.equal(extractJson("I cannot help with that"), null);
  assert.equal(extractJson("{ severity: high"), null);
  assert.equal(extractJson("{not json at all}"), null);
});

test("cleanupModelText removes fences, wrapping quotes and padding", () => {
  assert.equal(cleanupModelText('  "Floor is wet."  '), "Floor is wet.");
  assert.equal(cleanupModelText("```Floor is wet.```"), "Floor is wet.");
  assert.equal(cleanupModelText("'Floor is wet.'"), "Floor is wet.");
});

test("cleanupModelText caps runaway model output", () => {
  assert.equal(cleanupModelText("x".repeat(4000)).length, 1000);
});

test("the heuristic escalates hazard words to critical", () => {
  const ai = heuristic(ctx("Gas smell in the basement", "Strong odour near the boiler"));
  assert.equal(ai.severity, "critical");
  assert.equal(ai.source, "heuristic");
  assert.equal(ai.responseWindow, "Immediate (dispatch now)");
  assert.match(ai.suggestedAction, /Escalate immediately/);
});

test("the heuristic marks damage words as high", () => {
  const ai = heuristic(ctx("Broken window in the lobby", "Glass panel cracked"));
  assert.equal(ai.severity, "high");
  assert.equal(ai.responseWindow, "Within 1 hour");
});

test("the heuristic keeps cosmetic reports low", () => {
  const ai = heuristic(ctx("Dust on the reception desk", "Minor buildup", "cleaning"));
  assert.equal(ai.severity, "low");
  assert.equal(ai.responseWindow, "Next scheduled visit");
});

test("the heuristic defaults to medium when no keyword matches", () => {
  const ai = heuristic(ctx("Reception bin needs emptying", "Nothing urgent", "housekeeping"));
  assert.equal(ai.severity, "medium");
  assert.equal(ai.responseWindow, "Same day");
});

test("the heuristic reads the category too", () => {
  assert.equal(heuristic(ctx("Routine check", "", "electrical hazard")).severity, "critical");
});

test("the heuristic summary names the site and collapses whitespace", () => {
  const ai = heuristic(
    ctx("Water leak", "Pipe   dripping\n   under the sink", "plumbing", "Gulshan Tower"),
  );
  assert.equal(ai.summary, "Water leak at Gulshan Tower: Pipe dripping under the sink");
});

test("the heuristic falls back to the title when there is no description", () => {
  const ai = heuristic(ctx("Lift stuck between floors", "   "));
  assert.equal(ai.summary, "Lift stuck between floors: Lift stuck between floors");
});

test("the heuristic summary stays inside the column budget", () => {
  const ai = heuristic(ctx("Spill", "word ".repeat(200), "general", "Site A"));
  assert.ok(ai.summary.length <= 220);
});

test("safety wording routes to a safety officer", () => {
  assert.equal(heuristic(ctx("Electric shock risk", "Exposed wiring")).recommendedRole, "Safety Officer");
  assert.equal(recommendRole("smoke in the stairwell", "critical"), "Safety Officer");
});

test("plumbing wording routes to a field technician", () => {
  assert.equal(recommendRole("burst pipe in the riser", "high"), "Field Technician");
});

test("a severe report with no keyword goes to a lead cleaner", () => {
  assert.equal(recommendRole("everything is on fir", "critical"), "Lead Cleaner");
  assert.equal(recommendRole("routine restock", "low"), "Field Technician");
});

test("every heuristic response window resolves to a real SLA budget", () => {
  const cases = [
    ctx("Gas leak", "hazard"),
    ctx("Broken window", "damage"),
    ctx("Bin needs emptying", "routine"),
    ctx("Dust on the desk", "minor"),
  ];
  for (const subject of cases) {
    const ai = heuristic(subject);
    assert.equal(
      slaMinutes(ai.severity, ai.responseWindow) <= slaMinutes(ai.severity),
      true,
      `${ai.responseWindow} should not loosen the ${ai.severity} budget`,
    );
  }
});

test("tidyText collapses whitespace, capitalises sentences and closes the last one", () => {
  assert.equal(tidyText("the floor   is wet"), "The floor is wet.");
  assert.equal(tidyText("first one. second one"), "First one. Second one.");
  assert.equal(tidyText("already done!"), "Already done!");
  assert.equal(tidyText("   "), "");
});

test("shorten keeps the first two sentences", () => {
  assert.equal(shorten("one thing. two thing. three thing."), "One thing. Two thing.");
  assert.equal(shorten("just the one"), "Just the one.");
});

test("shorten truncates a very long single sentence with an ellipsis", () => {
  const long = shorten(`${"word ".repeat(100)}end`);
  assert.equal(long.length, 220);
  assert.match(long, /\.\.\.$/);
});
