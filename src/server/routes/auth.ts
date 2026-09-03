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
  emailOnlySchema,
  loginSchema,
  profileSchema,
  registerSchema,
  verifyTokenSchema,
} from "@/lib/validation";
import { sqlNow } from "@/lib/time";
import { clientAgent, clientIp, logAudit, notify, notifyAdmins } from "../activity";
import {
  RATE_RULES,
  loginBlocked,
  recordAttempt,
  registerBlocked,
  retryAfterMessage,
  verifyBlocked,
} from "../ratelimit";
import {
  describeAgent,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  startSession,
} from "../sessions";
import { createEmailToken, consumeEmailToken, invalidateTokens } from "../tokens";
import { sendMail, verificationLink, verificationMail } from "../mailer";
import { requireAuth, type Variables } from "../middleware";

export const authRoutes = new Hono<{ Variables: Variables }>();

const GENERIC_REGISTER_MESSAGE =
  "Registration received. Check your inbox to confirm the address — an administrator reviews new accounts before access is granted.";

async function issueVerification(
  userId: number,
  name: string,
  email: string,
): Promise<boolean> {
  await invalidateTokens(userId);
  const token = await createEmailToken(userId);
  const link = verificationLink(token);
  const result = await sendMail({ to: email, ...verificationMail(name, link) });
  return result.sent;
}

authRoutes.post("/register", async (c) => {
  const ip = clientIp(c);
  if (await registerBlocked(ip)) {
    return c.json({ error: retryAfterMessage(RATE_RULES.register) }, 429);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  await recordAttempt("register", { subject: email, ip, success: true });

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

  await issueVerification(created.id, name, email);
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

authRoutes.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = verifyTokenSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "That confirmation link is not valid." }, 400);
  }

  const consumed = await consumeEmailToken(parsed.data.token);
  if (!consumed) {
    return c.json({ error: "This link has expired or was already used." }, 400);
  }

  const account = await db
    .select({ id: users.id, name: users.name, email: users.email, status: users.status, verifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, consumed.userId))
    .get();
  if (!account) {
    return c.json({ error: "This link has expired or was already used." }, 400);
  }

  if (!account.verifiedAt) {
    await db.update(users).set({ emailVerifiedAt: sqlNow() }).where(eq(users.id, account.id));
    await notifyAdmins({
      type: "approval",
      title: "Email confirmed",
      body: `${account.name} (${account.email}) confirmed their address.`,
      link: "/members",
    });
  }

  await logAudit(c, {
    action: "verify_email",
    entity: "user",
    entityId: account.id,
    detail: account.email,
    actorId: account.id,
    actorEmail: account.email,
  });

  return c.json({
    ok: true,
    pending: account.status === "pending",
    message:
      account.status === "pending"
        ? "Email confirmed. An administrator will approve your account shortly."
        : "Email confirmed. You can sign in now.",
  });
});

authRoutes.post("/verify/resend", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = emailOnlySchema.safeParse(body);
  const generic = {
    ok: true,
    message: "If that address needs confirming, a new link is on its way.",
  };
  if (!parsed.success) return c.json(generic);

  const email = parsed.data.email.toLowerCase();
  if (await verifyBlocked(email)) {
    return c.json({ error: retryAfterMessage(RATE_RULES.verify) }, 429);
  }
  await recordAttempt("verify", { subject: email, ip: clientIp(c), success: true });

  const account = await db
    .select({ id: users.id, name: users.name, verifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (account && !account.verifiedAt) {
    await issueVerification(account.id, account.name, email);
  }
  return c.json(generic);
});

authRoutes.post("/login", async (c) => {
  const ip = clientIp(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  const email = String((body as { email?: string }).email ?? "").toLowerCase().slice(0, 160);

  if (await loginBlocked(email, ip)) {
    await logAudit(c, {
      action: "login_locked",
      entity: "auth",
      detail: email || "unknown",
      actorId: null,
      actorEmail: email || "unknown",
    });
    return c.json({ error: retryAfterMessage(RATE_RULES.loginEmail) }, 429);
  }

  if (!parsed.success) {
    await recordAttempt("login", { subject: email, ip, success: false });
    return c.json({ error: "Invalid email or password" }, 401);
  }
  const { password } = parsed.data;

  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    await equalizeTiming(password);
    await recordAttempt("login", { subject: email, ip, success: false });
    return c.json({ error: "Invalid email or password" }, 401);
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordAttempt("login", { subject: email, ip, success: false });
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
    await recordAttempt("login", { subject: email, ip, success: true });
    return c.json(
      { error: "Your account has been suspended. Contact an administrator." },
      403,
    );
  }
  if (user.status === "pending") {
    await recordAttempt("login", { subject: email, ip, success: true });
    return c.json(
      {
        error: user.emailVerifiedAt
          ? "Your account is awaiting admin approval. Please check back soon."
          : "Confirm your email address first, then wait for admin approval.",
        pending: true,
        emailVerified: Boolean(user.emailVerifiedAt),
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
  await recordAttempt("login", { subject: email, ip, success: true });
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
      emailVerifiedAt: users.emailVerifiedAt,
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
    user: { ...session, ...account, emailVerified: Boolean(account?.emailVerifiedAt) },
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
    await recordAttempt("login", { subject: session.email, ip: clientIp(c), success: false });
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


