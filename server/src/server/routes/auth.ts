import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, workers } from "@/db/schema";
import {
  SESSION_COOKIE,
  clearCookieOptions,
  equalizeTiming,
  hashPassword,
  sessionCookieOptions,
  signToken,
  verifyPassword,
  verifyToken,
} from "@/lib/auth";
import {
  changePasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
} from "@/lib/validation";
import { clientAgent, clientIp, logAudit, notify, notifyAdmins } from "../activity";
import {
  RATE_RULES,
  consumeRateLimit,
  loginFailureAdmissionAllowed,
  recordLoginFailure,
  retryAfterMessage,
} from "../ratelimit";
import {
  describeAgent,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  startSession,
} from "../sessions";
import { requireAuth, type Variables } from "../middleware";

export const authRoutes = new Hono<{ Variables: Variables }>();

const GENERIC_REGISTER_MESSAGE =
  "Registration received. An administrator reviews new accounts before access is granted.";

authRoutes.post("/register", async (c) => {
  const ip = clientIp(c);

  const body = await c.req.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  if (!(await consumeRateLimit("register", RATE_RULES.register, { ip }))) {
    return c.json({ error: retryAfterMessage(RATE_RULES.register) }, 429);
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) {
    await equalizeTiming(password);
    return c.json({ pending: true, message: GENERIC_REGISTER_MESSAGE });
  }

  const passwordHash = await hashPassword(password);
  const created = await db
    .insert(users)
    .values({ name, email, passwordHash, role: "user", status: "pending" })
    .returning({ id: users.id })
    .get();

  await notifyAdmins({
    type: "approval",
    title: "New registration awaiting approval",
    body: `${name} (${email}) signed up and needs review.`,
    link: "/members",
  });
  await logAudit(c, {
    action: "register",
    entity: "user",
    entityId: created.id,
    detail: `${name} requested access`,
    actorId: created.id,
    actorEmail: email,
  });

  return c.json({ pending: true, message: GENERIC_REGISTER_MESSAGE });
});

authRoutes.post("/login", async (c) => {
  const ip = clientIp(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  const email = String((body as { email?: string }).email ?? "").toLowerCase().slice(0, 160);

  if (!(await loginFailureAdmissionAllowed(email, ip))) {
    return c.json({ error: retryAfterMessage(RATE_RULES.loginEmail) }, 429);
  }

  if (!parsed.success) {
    if (!(await recordLoginFailure(email, ip))) {
      return c.json({ error: retryAfterMessage(RATE_RULES.loginEmail) }, 429);
    }
    return c.json({ error: "Invalid email or password" }, 401);
  }
  const { password } = parsed.data;

  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    await equalizeTiming(password);
    if (!(await recordLoginFailure(email, ip))) {
      return c.json({ error: retryAfterMessage(RATE_RULES.loginEmail) }, 429);
    }
    return c.json({ error: "Invalid email or password" }, 401);
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    if (!(await recordLoginFailure(email, ip))) {
      return c.json({ error: retryAfterMessage(RATE_RULES.loginEmail) }, 429);
    }
    await logAudit(c, {
      action: "login_failed",
      entity: "user",
      entityId: user.id,
      detail: "wrong password",
      actorId: user.id,
      actorEmail: user.email,
    });
    return c.json({ error: "Invalid email or password" }, 401);
  }
  if (user.status === "banned") {
    return c.json(
      { error: "Your account has been suspended. Contact an administrator." },
      403,
    );
  }
  if (user.status === "pending") {
    return c.json(
      {
        error: "Your account is awaiting admin approval. Please check back soon.",
        pending: true,
      },
      403,
    );
  }

  const sessionId = await startSession(user.id, { ip, userAgent: clientAgent(c) });
  const token = await signToken({
    sub: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    jti: sessionId,
  });
  setCookie(c, SESSION_COOKIE, token, sessionCookieOptions());
  await logAudit(c, {
    action: "login",
    entity: "user",
    entityId: user.id,
    detail: describeAgent(clientAgent(c)),
    actorId: user.id,
    actorEmail: user.email,
  });

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

authRoutes.post("/logout", async (c) => {
  const session = await verifyToken(getCookie(c, SESSION_COOKIE));
  if (session?.jti) {
    await revokeSession(session.jti, Number(session.sub));
    await logAudit(c, {
      action: "logout",
      entity: "user",
      entityId: Number(session.sub),
      detail: "session revoked",
      actorId: Number(session.sub),
      actorEmail: session.email,
    });
  }
  deleteCookie(c, SESSION_COOKIE, clearCookieOptions());
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const session = c.get("user");
  const account = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, Number(session.sub)))
    .get();

  const worker = await db
    .select({
      id: workers.id,
      role: workers.role,
      phone: workers.phone,
      status: workers.status,
    })
    .from(workers)
    .where(eq(workers.userId, Number(session.sub)))
    .get();

  return c.json({
    user: { ...session, ...account },
    worker: worker ?? null,
  });
});

authRoutes.get("/sessions", requireAuth, async (c) => {
  const session = c.get("user");
  const rows = await listSessions(Number(session.sub));
  return c.json({
    data: rows.map((row) => ({
      ...row,
      device: describeAgent(row.userAgent),
      current: row.id === session.jti,
      active: !row.revokedAt,
    })),
  });
});

authRoutes.delete("/sessions/:id", requireAuth, async (c) => {
  const session = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Session not found" }, 404);
  const revoked = await revokeSession(id, Number(session.sub));
  if (!revoked) return c.json({ error: "Session not found" }, 404);
  await logAudit(c, { action: "revoke_session", entity: "session", detail: id });
  if (id === session.jti) {
    deleteCookie(c, SESSION_COOKIE, clearCookieOptions());
    return c.json({ ok: true, signedOut: true });
  }
  return c.json({ ok: true, signedOut: false });
});

authRoutes.post("/sessions/revoke-others", requireAuth, async (c) => {
  const session = c.get("user");
  const count = await revokeOtherSessions(Number(session.sub), session.jti);
  await logAudit(c, {
    action: "revoke_other_sessions",
    entity: "session",
    detail: `${count} session(s)`,
  });
  return c.json({ ok: true, revoked: count });
});

authRoutes.post("/password", requireAuth, async (c) => {
  const session = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const account = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, Number(session.sub)))
    .get();
  if (!account) return c.json({ error: "Unauthorized" }, 401);

  if (!(await verifyPassword(parsed.data.currentPassword, account.passwordHash))) {
    if (!(await recordLoginFailure(session.email, clientIp(c)))) {
      return c.json({ error: retryAfterMessage(RATE_RULES.loginEmail) }, 429);
    }
    return c.json({ error: "Your current password is incorrect" }, 400);
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return c.json({ error: "Pick a password different from the current one" }, 400);
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword) })
    .where(eq(users.id, account.id));
  const revoked = await revokeOtherSessions(account.id, session.jti);

  await logAudit(c, {
    action: "change_password",
    entity: "user",
    entityId: account.id,
    detail: `other sessions revoked: ${revoked}`,
  });
  await notify([
    {
      userId: account.id,
      type: "security",
      title: "Password changed",
      body: revoked
        ? `Your password was updated and ${revoked} other session(s) were signed out.`
        : "Your password was updated.",
      link: "/account",
    },
  ]);

  return c.json({ ok: true, revoked });
});

authRoutes.patch("/profile", requireAuth, async (c) => {
  const session = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const id = Number(session.sub);
  await db.update(users).set({ name: parsed.data.name }).where(eq(users.id, id));
  await db
    .update(workers)
    .set({ name: parsed.data.name, phone: parsed.data.phone })
    .where(eq(workers.userId, id));

  await logAudit(c, {
    action: "update_profile",
    entity: "user",
    entityId: id,
    detail: parsed.data.name,
  });
  return c.json({ ok: true });
});
