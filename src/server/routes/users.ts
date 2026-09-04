import { Hono } from "hono";
import { and, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidents, users, workers } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { adminCreateUserSchema, resetPasswordSchema, userUpdateSchema } from "@/lib/validation";
import { logAudit, notify } from "../activity";
import { revokeOtherSessions } from "../sessions";
import {
  listMeta,
  orderFor,
  parseListQuery,
  pickEnum,
  searchPattern,
} from "../query";
import { csvResponse, stamped, toCsv } from "../csv";
import { requireAuth, requireAdmin, type Variables } from "../middleware";

export const userRoutes = new Hono<{ Variables: Variables }>();

userRoutes.use("*", requireAuth);
userRoutes.use("*", requireAdmin);

const SORTABLE = ["createdAt", "name", "email", "role", "status"] as const;
const STATUSES = ["active", "banned", "pending"] as const;
const ROLES = ["admin", "user"] as const;

const publicUserCols = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
};

const SORT_COLUMNS: Record<string, unknown> = {
  createdAt: users.createdAt,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
};

async function ensureWorkerForUser(u: { id: number; name: string; email: string; role: string }) {
  if (u.role !== "user") return;
  const existing = await db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.userId, u.id))
    .get();
  if (existing) return;
  const emailTaken = await db
    .select({ id: workers.id })
    .from(workers)
    .where(eq(workers.email, u.email.toLowerCase()))
    .get();
  if (emailTaken) {
    await db.update(workers).set({ userId: u.id }).where(eq(workers.id, emailTaken.id));
    return;
  }
  await db.insert(workers).values({
    userId: u.id,
    name: u.name,
    email: u.email.toLowerCase(),
    role: "Field Technician",
    status: "available",
  });
}

function conditionsFor(query: Record<string, string>, search: string) {
  const conditions = [];
  const status = pickEnum(query.status, STATUSES);
  const role = pickEnum(query.role, ROLES);
  if (status) conditions.push(eq(users.status, status));
  if (role) conditions.push(eq(users.role, role));
  if (search) {
    const pattern = searchPattern(search);
    conditions.push(or(like(users.name, pattern), like(users.email, pattern))!);
  }
  return conditions;
}

userRoutes.get("/", async (c) => {
  const query = parseListQuery(c, { sortable: SORTABLE, defaultSort: "createdAt" });
  const conditions = conditionsFor(c.req.query(), query.q);
  const where = conditions.length ? and(...conditions) : undefined;
  const column = (SORT_COLUMNS[query.sort] ?? users.createdAt) as never;

  const [rows, countRow, tally] = await Promise.all([
    db
      .select({
        ...publicUserCols,
        workerId: workers.id,
        workerRole: workers.role,
      })
      .from(users)
      .leftJoin(workers, eq(workers.userId, users.id))
      .where(where)
      .orderBy(orderFor(column, query.dir))
      .limit(query.pageSize)
      .offset(query.offset)
      .all(),
    db.select({ total: sql<number>`count(*)` }).from(users).where(where).get(),
    db
      .select({
        pending: sql<number>`sum(case when ${users.status} = 'pending' then 1 else 0 end)`,
        banned: sql<number>`sum(case when ${users.status} = 'banned' then 1 else 0 end)`,
        admins: sql<number>`sum(case when ${users.role} = 'admin' then 1 else 0 end)`,
      })
      .from(users)
      .get(),
  ]);

  const data = rows;

  if (query.isExport) {
    const csv = toCsv(
      ["ID", "Name", "Email", "Role", "Status", "Worker profile", "Created"],
      data.map((row) => [
        row.id,
        row.name,
        row.email,
        row.role,
        row.status,
        row.workerId ? row.workerRole ?? "yes" : "no",
        row.createdAt,
      ]),
    );
    await logAudit(c, { action: "export", entity: "user", detail: `${data.length} rows` });
    return csvResponse(c, stamped("members"), csv);
  }

  return c.json({
    data,
    meta: listMeta(query, Number(countRow?.total ?? 0)),
    summary: {
      pending: Number(tally?.pending ?? 0),
      banned: Number(tally?.banned ?? 0),
      admins: Number(tally?.admins ?? 0),
    },
  });
});

userRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = adminCreateUserSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { name, password, role } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
  if (existing) return c.json({ error: "Email already registered" }, 409);

  const passwordHash = await hashPassword(password);
  const row = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash,
      role,
      status: "active",
    })
    .returning(publicUserCols)
    .get();
  await ensureWorkerForUser(row);
  await logAudit(c, {
    action: "create",
    entity: "user",
    entityId: row.id,
    detail: `${name} as ${role}`,
  });
  return c.json({ user: row }, 201);
});

userRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const me = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { status, role } = parsed.data;
  if (!status && !role) return c.json({ error: "Nothing to update" }, 400);

  if (Number(me.sub) === id) {
    return c.json({ error: "You cannot change your own account" }, 400);
  }

  const target = await db.select().from(users).where(eq(users.id, id)).get();
  if (!target) return c.json({ error: "User not found" }, 404);
  if (target.role === "admin" && status === "banned") {
    return c.json({ error: "Admin accounts cannot be banned" }, 400);
  }
  if (target.role === "admin" && role === "user") {
    const adminRow = await db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active")))
      .get();
    if (Number(adminRow?.total ?? 0) <= 1) {
      return c.json({ error: "Keep at least one active admin" }, 400);
    }
  }

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (role) patch.role = role;

  const row = await db.update(users).set(patch).where(eq(users.id, id)).returning(publicUserCols).get();

  if (status === "active") {
    await ensureWorkerForUser(row);
    if (target.status !== "active") {
      await notify([
        {
          userId: row.id,
          type: "approval",
          title: "Your account is approved",
          body: "You can sign in and start reporting incidents.",
          link: "/dashboard",
        },
      ]);
    }
  }
  if (status === "banned") {
    await revokeOtherSessions(row.id, null);
  }
  if (role && role !== target.role) {
    await notify([
      {
        userId: row.id,
        type: "security",
        title: `Your role is now ${role}`,
        body: "An administrator updated your access level.",
        link: "/account",
      },
    ]);
  }

  await logAudit(c, {
    action: "update",
    entity: "user",
    entityId: id,
    detail: [status ? `status=${status}` : null, role ? `role=${role}` : null]
      .filter(Boolean)
      .join(" "),
  });

  return c.json({ user: row });
});

userRoutes.post("/:id/password", async (c) => {
  const id = Number(c.req.param("id"));
  const me = c.get("user");
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid user id" }, 400);
  if (Number(me.sub) === id) {
    return c.json({ error: "Change your own password from the account page" }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const target = await db.select().from(users).where(eq(users.id, id)).get();
  if (!target) return c.json({ error: "User not found" }, 404);
  if (target.role === "admin") {
    return c.json({ error: "Another admin's password cannot be reset here" }, 400);
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(users.id, id));
  const revoked = await revokeOtherSessions(id, null);

  await notify([
    {
      userId: id,
      type: "security",
      title: "Your password was reset",
      body: "An administrator set a new password for your account. Sign in with it, then change it from your account page.",
      link: "/account",
    },
  ]);
  await logAudit(c, {
    action: "password_reset",
    entity: "user",
    entityId: id,
    detail: `${target.email} — ${revoked} session(s) signed out`,
  });

  return c.json({ ok: true, revoked });
});

userRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const me = c.get("user");
  if (Number(me.sub) === id) {
    return c.json({ error: "You cannot delete your own account" }, 400);
  }
  const target = await db.select().from(users).where(eq(users.id, id)).get();
  if (!target) return c.json({ error: "User not found" }, 404);
  if (target.role === "admin") {
    return c.json({ error: "Admin accounts cannot be deleted" }, 400);
  }

  const reported = await db
    .select({ total: sql<number>`count(*)` })
    .from(incidents)
    .where(eq(incidents.reportedBy, id))
    .get();
  if (Number(reported?.total ?? 0) > 0) {
    return c.json(
      { error: "This member has reported incidents — ban the account instead of deleting it" },
      409,
    );
  }

  await db.delete(users).where(eq(users.id, id));
  await logAudit(c, {
    action: "delete",
    entity: "user",
    entityId: id,
    detail: target.email,
  });
  return c.json({ ok: true });
});
