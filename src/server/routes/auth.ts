import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  signToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { loginSchema, registerSchema } from "@/lib/validation";
import { requireAuth, type Variables } from "../middleware";

export const authRoutes = new Hono<{ Variables: Variables }>();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const { name, email, password } = parsed.data;

  const existing = db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .get();
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await hashPassword(password);
  db.insert(users)
    .values({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: "user",
      status: "pending",
    })
    .run();

  return c.json({
    pending: true,
    message:
      "Registration received. An administrator will review and approve your account shortly.",
  });
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid credentials" }, 400);
  }
  const { email, password } = parsed.data;

  const user = db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .get();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
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
      { error: "Your account is awaiting admin approval. Please check back soon." },
      403,
    );
  }

  const token = await signToken({
    sub: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
  });
  setCookie(c, SESSION_COOKIE, token, sessionCookieOptions());

  return c.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

authRoutes.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  return c.json({ user });
});
