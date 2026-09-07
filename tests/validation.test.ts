import test from "node:test";
import assert from "node:assert/strict";
import {
  adminCreateUserSchema,
  assignmentSchema,
  changePasswordSchema,
  commentSchema,
  enhanceTextSchema,
  incidentSchema,
  incidentUpdateSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  siteSchema,
  strongPassword,
  taskUpdateSchema,
  userUpdateSchema,
  workerSchema,
} from "../src/lib/validation";

const GOOD = "Cleanops1";

test("a password needs length, both cases and a digit", () => {
  assert.equal(strongPassword.safeParse(GOOD).success, true);
  assert.equal(strongPassword.safeParse("Short1").success, false);
  assert.equal(strongPassword.safeParse("cleanops1").success, false);
  assert.equal(strongPassword.safeParse("CLEANOPS1").success, false);
  assert.equal(strongPassword.safeParse("Cleanopsx").success, false);
});

test("a password is capped so bcrypt never silently truncates", () => {
  assert.equal(strongPassword.safeParse(`Aa1${"x".repeat(69)}`).success, true);
  assert.equal(strongPassword.safeParse(`Aa1${"x".repeat(70)}`).success, false);
});

test("every password rejection explains the whole policy", () => {
  const parsed = strongPassword.safeParse("weak");
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.issues[0].message, /uppercase letter/);
  }
});

test("resetPasswordSchema enforces the same policy as registration", () => {
  assert.equal(resetPasswordSchema.safeParse({ password: GOOD }).success, true);
  assert.equal(resetPasswordSchema.safeParse({ password: "weak" }).success, false);
  assert.equal(resetPasswordSchema.safeParse({}).success, false);
});

test("registration needs a real name, email and strong password", () => {
  assert.equal(
    registerSchema.safeParse({ name: "Jane Doe", email: "jane@site.com", password: GOOD }).success,
    true,
  );
  assert.equal(
    registerSchema.safeParse({ name: "J", email: "jane@site.com", password: GOOD }).success,
    false,
  );
  assert.equal(
    registerSchema.safeParse({ name: "Jane Doe", email: "jane", password: GOOD }).success,
    false,
  );
});

test("login only checks that a password was typed", () => {
  assert.equal(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success, true);
  assert.equal(loginSchema.safeParse({ email: "a@b.com", password: "" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "nope", password: "x" }).success, false);
});

test("admin created accounts default to the user role", () => {
  const parsed = adminCreateUserSchema.safeParse({
    name: "Jane Doe",
    email: "jane@site.com",
    password: GOOD,
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.role, "user");
});

test("only admin and user are valid roles", () => {
  const base = { name: "Jane Doe", email: "jane@site.com", password: GOOD };
  assert.equal(adminCreateUserSchema.safeParse({ ...base, role: "admin" }).success, true);
  assert.equal(adminCreateUserSchema.safeParse({ ...base, role: "superadmin" }).success, false);
});

test("userUpdateSchema exposes status and role only", () => {
  assert.equal(userUpdateSchema.safeParse({ status: "banned" }).success, true);
  assert.equal(userUpdateSchema.safeParse({ role: "admin" }).success, true);
  assert.equal(userUpdateSchema.safeParse({ status: "deleted" }).success, false);
  const sneaky = userUpdateSchema.safeParse({ password: "Cleanops1", role: "admin" });
  assert.equal(sneaky.success, true);
  if (sneaky.success) assert.equal("password" in sneaky.data, false);
});

test("changing your own password needs the current one", () => {
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: "old", newPassword: GOOD }).success,
    true,
  );
  assert.equal(changePasswordSchema.safeParse({ newPassword: GOOD }).success, false);
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: "old", newPassword: "weak" }).success,
    false,
  );
});

test("sites default to active and require a code", () => {
  const parsed = siteSchema.safeParse({ name: "Gulshan Tower", code: "GT-01" });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.status, "active");
    assert.equal(parsed.data.location, "");
  }
  assert.equal(siteSchema.safeParse({ name: "Gulshan Tower" }).success, false);
});

test("workers default to an available field technician", () => {
  const parsed = workerSchema.safeParse({ name: "Rafi", email: "rafi@site.com" });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.role, "Field Technician");
    assert.equal(parsed.data.status, "available");
  }
});

test("assignments need positive integer ids", () => {
  assert.equal(assignmentSchema.safeParse({ siteId: 1, workerId: 2 }).success, true);
  assert.equal(assignmentSchema.safeParse({ siteId: 0, workerId: 2 }).success, false);
  assert.equal(assignmentSchema.safeParse({ siteId: 1.5, workerId: 2 }).success, false);
  assert.equal(assignmentSchema.safeParse({ siteId: "1", workerId: 2 }).success, false);
});

test("a new incident only needs a title and a site and leaves severity for AI triage", () => {
  const parsed = incidentSchema.safeParse({ title: "Water leak", siteId: 3 });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.severity, undefined);
    assert.equal(parsed.data.category, "general");
    assert.equal(parsed.data.description, "");
  }
  assert.equal(incidentSchema.safeParse({ title: "ab", siteId: 3 }).success, false);
});

test("incident updates accept a null assignee to unassign", () => {
  assert.equal(incidentUpdateSchema.safeParse({ assignedTo: null }).success, true);
  assert.equal(incidentUpdateSchema.safeParse({ assignedTo: 4 }).success, true);
  assert.equal(incidentUpdateSchema.safeParse({ assignedTo: 0 }).success, false);
  assert.equal(incidentUpdateSchema.safeParse({ dueAt: null }).success, true);
  assert.equal(incidentUpdateSchema.safeParse({ status: "archived" }).success, false);
  assert.equal(incidentUpdateSchema.safeParse({}).success, true);
});

test("comments and tasks reject one character noise", () => {
  assert.equal(commentSchema.safeParse({ body: "Handled it" }).success, true);
  assert.equal(commentSchema.safeParse({ body: "x" }).success, false);
  assert.equal(taskUpdateSchema.safeParse({ done: true }).success, true);
  assert.equal(taskUpdateSchema.safeParse({ done: "yes" }).success, false);
});

test("the AI editor defaults to formal English styling", () => {
  const parsed = enhanceTextSchema.safeParse({ text: "the floor is wet" });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.mode, "style");
    assert.equal(parsed.data.preset, "formal");
    assert.equal(parsed.data.language, "english");
  }
  assert.equal(enhanceTextSchema.safeParse({ text: "hi", mode: "style" }).success, false);
  assert.equal(enhanceTextSchema.safeParse({ text: "hello", mode: "rewrite" }).success, false);
});
