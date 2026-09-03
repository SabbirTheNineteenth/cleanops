import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "./schema";
import { analyzeIncident } from "../server/ai";
import { toSqlTime } from "../lib/time";

const url = process.env.DATABASE_URL || "file:cleanops.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const client = createClient({ url, authToken });
const db = drizzle(client, { schema });

const NOW = new Date();
const DAY = 24;

function shift(hours: number): Date {
  return new Date(NOW.getTime() + hours * 3_600_000);
}

function stamp(hours: number): string {
  return toSqlTime(shift(hours));
}

async function wipe() {
  await db.delete(schema.authAttempts).run();
  await db.delete(schema.sessions).run();
  await db.delete(schema.auditLogs).run();
  await db.delete(schema.notifications).run();
  await db.delete(schema.incidentTasks).run();
  await db.delete(schema.incidentEvents).run();
  await db.delete(schema.incidentComments).run();
  await db.delete(schema.incidents).run();
  await db.delete(schema.assignments).run();
  await db.delete(schema.workers).run();
  await db.delete(schema.sites).run();
  await db.delete(schema.users).run();
}

interface Seed {
  title: string;
  description: string;
  category: string;
  siteIdx: number;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "assigned" | "in_progress" | "resolved";
  workerIdx: number | null;
  reportedAt: number;
  dueAt: number;
  resolvedAt?: number;
  responseWindow: string;
  note?: string;
  comments?: [number, number, string][];
  tasks?: [string, boolean][];
}

const SITE_DATA = [
  { name: "Downtown Tower", code: "DT-01", location: "12 Market St", status: "active" as const },
  { name: "Riverside Mall", code: "RM-02", location: "88 River Rd", status: "active" as const },
  { name: "Airport Terminal B", code: "AT-03", location: "Terminal B, Gate 4", status: "active" as const },
  { name: "Northgate Clinic", code: "NC-05", location: "3 Northgate Way", status: "active" as const },
  { name: "Old Depot", code: "OD-04", location: "5 Industrial Ave", status: "inactive" as const },
];

const WORKER_DATA = [
  { name: "Maria Lopez", email: "maria@cleanops.dev", phone: "555-0101", role: "Lead Cleaner" },
  { name: "John Carter", email: "john@cleanops.dev", phone: "555-0102", role: "Field Technician" },
  { name: "Priya Nair", email: "priya@cleanops.dev", phone: "555-0103", role: "Safety Officer" },
  { name: "Tom Becker", email: "tom@cleanops.dev", phone: "555-0104", role: "Field Technician" },
];

const UNLINKED_WORKER = {
  name: "Grace Okoye",
  email: "grace@cleanops.dev",
  phone: "555-0105",
  role: "Field Technician",
};

const ASSIGNMENT_PAIRS: [number, number][] = [
  [0, 0],
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];

const AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";


const SEEDS: Seed[] = [
  {
    title: "Water leak in lobby ceiling",
    description: "Steady drip near the main entrance, small puddle forming on the marble. Slip hazard for morning footfall.",
    category: "plumbing",
    siteIdx: 0,
    severity: "high",
    status: "resolved",
    workerIdx: 1,
    reportedAt: -960,
    dueAt: -959,
    resolvedAt: -959.3,
    responseWindow: "Within 1 hour",
    note: "Loose fitting on the level 2 riser tightened, ceiling void dried and checked for staining.",
    comments: [
      [1, 0.2, "Cordoned off the area with wet floor signs."],
      [3, 0.5, "Traced it to a loose fitting on the level 2 riser. Tightened and dried the ceiling void."],
      [0, 0.8, "Confirmed dry on my walk-through. Closing this out."],
    ],
    tasks: [
      ["Place wet floor signage", true],
      ["Shut off the riser valve", true],
      ["Dry ceiling void and check for staining", true],
    ],
  },
  {
    title: "Broken glass at food court",
    description: "A glass panel shattered near the seating area, sharp fragments spread across the floor.",
    category: "safety",
    siteIdx: 1,
    severity: "critical",
    status: "resolved",
    workerIdx: 2,
    reportedAt: -792,
    dueAt: -791.5,
    resolvedAt: -791.6,
    responseWindow: "Immediate",
    note: "Fragments cleared, seating barriered off, panel replacement booked with the contractor.",
    comments: [
      [4, 0.2, "Area swept and vacuumed, glass bagged for disposal."],
      [0, 0.35, "Panel replacement booked with the contractor for tomorrow morning."],
    ],
    tasks: [
      ["Clear glass fragments", true],
      ["Barrier off the seating area", true],
      ["Book panel replacement", true],
    ],
  },
  {
    title: "Restroom out of supplies",
    description: "Paper towels and soap need restocking on level 2, reported by two tenants.",
    category: "supplies",
    siteIdx: 1,
    severity: "low",
    status: "resolved",
    workerIdx: 2,
    reportedAt: -624,
    dueAt: -576,
    resolvedAt: -604,
    responseWindow: "Next scheduled visit",
    note: "Both dispensers restocked, spare cartridges left in the cupboard.",
    comments: [[4, 1, "Restocked both dispensers and left spare cartridges in the cupboard."]],
    tasks: [
      ["Restock paper towels", true],
      ["Restock soap", true],
    ],
  },
  {
    title: "Elevator lobby floor sticky after spill",
    description: "Soft drink spill outside lift 3 has dried and is tacky underfoot.",
    category: "cosmetic",
    siteIdx: 0,
    severity: "medium",
    status: "resolved",
    workerIdx: 0,
    reportedAt: -456,
    dueAt: -448,
    resolvedAt: -451,
    responseWindow: "Same day",
    note: "Section buffed and resealed, dried before reopening to foot traffic.",
    comments: [[2, 1, "Buffed and resealed the section, dried it before reopening."]],
    tasks: [
      ["Buff the scuffed section", true],
      ["Reseal and dry", true],
    ],
  },
  {
    title: "Sharps container overflowing in exam room 3",
    description: "Container is past the fill line and the lid will not close properly.",
    category: "safety",
    siteIdx: 3,
    severity: "high",
    status: "resolved",
    workerIdx: 0,
    reportedAt: -288,
    dueAt: -287,
    resolvedAt: -287.2,
    responseWindow: "Within 1 hour",
    note: "Container swapped and the area disinfected, pickup frequency raised to twice weekly.",
    comments: [
      [2, 0.3, "Container swapped, floor wiped down with disinfectant."],
      [0, 0.9, "Clinic manager notified. Pickup frequency is going to twice weekly."],
    ],
    tasks: [
      ["Swap the sharps container", true],
      ["Disinfect the surrounding area", true],
      ["Raise pickup frequency", true],
    ],
  },
  {
    title: "Vending area bins not emptied",
    description: "Two bins by the vending machines were skipped on the last round.",
    category: "supplies",
    siteIdx: 2,
    severity: "low",
    status: "resolved",
    workerIdx: 3,
    reportedAt: -216,
    dueAt: -168,
    resolvedAt: -176,
    responseWindow: "Next scheduled visit",
    note: "Bins emptied and liners replaced on the following visit.",
    comments: [[5, 20, "Bins emptied and liners replaced on the next visit."]],
    tasks: [["Empty bins and replace liners", true]],
  },
  {
    title: "Electrical smell near gate 4",
    description: "Faint burning smell close to the charging station, possible wiring issue behind the panel.",
    category: "electrical",
    siteIdx: 2,
    severity: "critical",
    status: "resolved",
    workerIdx: 3,
    reportedAt: -528,
    dueAt: -527.5,
    resolvedAt: -522,
    responseWindow: "Immediate",
    note: "Burnt terminal block replaced. Response window missed while waiting on an airport electrical permit.",
    comments: [
      [5, 1, "No visible scorching, but the smell is strongest at the charging station."],
      [0, 2, "Escalated to the airport electrical team, they need a permit to open the panel."],
      [5, 5.5, "Panel opened, burnt terminal block replaced. Smell is gone."],
      [0, 6, "We missed the response window because of the permit wait. Logging it as a breach."],
    ],
    tasks: [
      ["Isolate the charging station", true],
      ["Request an electrical permit", true],
      ["Replace the terminal block", true],
      ["Re-test after 24 hours", true],
    ],
  },
  {
    title: "Mould spotted in basement store room",
    description: "Dark patches along the north wall behind the shelving, musty smell in the whole room.",
    category: "maintenance",
    siteIdx: 4,
    severity: "medium",
    status: "resolved",
    workerIdx: 1,
    reportedAt: -360,
    dueAt: -352,
    resolvedAt: -324,
    responseWindow: "Same day",
    note: "Affected boarding removed and the wall treated. Remediation ran late while the depot was being decommissioned.",
    comments: [
      [3, 2, "Ventilation in there is dead, that is why it keeps coming back."],
      [0, 30, "Remediation slipped while the depot was being decommissioned."],
    ],
    tasks: [
      ["Remove affected boarding", true],
      ["Treat and seal the wall", true],
      ["Restore ventilation", false],
    ],
  },
  {
    title: "Ceiling tile fell in corridor 2",
    description: "A full tile dropped onto the corridor floor outside the waiting room. Neighbouring tiles look to be sagging.",
    category: "safety",
    siteIdx: 3,
    severity: "high",
    status: "in_progress",
    workerIdx: 0,
    reportedAt: -30,
    dueAt: -29,
    responseWindow: "Within 1 hour",
    comments: [
      [1, 0.3, "Corridor closed at both ends, no injuries."],
      [2, 2, "Two more tiles are sagging. I need a ladder and a spare tile pack."],
      [0, 4, "Ordering tiles now. Keep the corridor shut until they land."],
    ],
    tasks: [
      ["Close corridor 2", true],
      ["Inspect adjacent tiles", true],
      ["Order replacement tile pack", false],
      ["Refit the ceiling grid", false],
    ],
  },
  {
    title: "Front entrance mat torn, trip hazard",
    description: "The entrance mat has a tear roughly 30cm across the main walkway line.",
    category: "safety",
    siteIdx: 1,
    severity: "medium",
    status: "open",
    workerIdx: null,
    reportedAt: -26,
    dueAt: -18,
    responseWindow: "Same day",
    comments: [[1, 0.2, "Photo sent to the site manager, the tear runs right across the walkway."]],
    tasks: [
      ["Assign a technician", false],
      ["Replace or tape down the mat", false],
    ],
  },
  {
    title: "AC condensate dripping onto server rack",
    description: "Condensate tray above the comms room is overflowing and water is landing on the top of a live rack.",
    category: "electrical",
    siteIdx: 0,
    severity: "high",
    status: "in_progress",
    workerIdx: 1,
    reportedAt: -7,
    dueAt: 1,
    responseWindow: "Same day",
    comments: [
      [3, 0.5, "Tray is full, rack is dry so far. Wrapped it in sheeting as a stopgap."],
      [0, 1, "Do not power anything down. The HVAC contractor is on the way."],
    ],
    tasks: [
      ["Sheet over the rack", true],
      ["Empty the condensate tray", true],
      ["Clear the drain line", false],
    ],
  },
  {
    title: "Escalator handrail squealing",
    description: "Loud squeal from the up escalator handrail, shoppers are commenting on it.",
    category: "maintenance",
    siteIdx: 1,
    severity: "medium",
    status: "assigned",
    workerIdx: 2,
    reportedAt: -40,
    dueAt: 8,
    responseWindow: "Next scheduled visit",
    comments: [[4, 1, "Squeal is worst on the up escalator, most likely the drive belt."]],
    tasks: [
      ["Log the fault with the escalator vendor", true],
      ["Restrict use during peak hours", false],
    ],
  },
  {
    title: "Waiting room chairs need deep clean",
    description: "Upholstery is marked on six chairs in the main waiting room, routine deep clean requested.",
    category: "cosmetic",
    siteIdx: 3,
    severity: "low",
    status: "assigned",
    workerIdx: 0,
    reportedAt: -6,
    dueAt: 42,
    responseWindow: "Next scheduled visit",
    tasks: [
      ["Book a deep clean slot", true],
      ["Steam clean the upholstery", false],
    ],
  },
  {
    title: "Second floor window streaks after rain",
    description: "Exterior glazing on level 2 has run marks after yesterday's rain, visible from the concourse.",
    category: "cosmetic",
    siteIdx: 2,
    severity: "low",
    status: "open",
    workerIdx: null,
    reportedAt: -3,
    dueAt: 45,
    responseWindow: "Next scheduled visit",
    tasks: [["Re-clean glazing on level 2", false]],
  },
];

async function main() {
  console.log("Seeding demo data...");
  await wipe();

  const adminHash = await bcrypt.hash("admin123", 10);
  const staffHash = await bcrypt.hash("user123", 10);
  const crewHash = await bcrypt.hash("worker123", 10);
  const memberHash = await bcrypt.hash("member123", 10);

  const addUser = (values: typeof schema.users.$inferInsert) =>
    db.insert(schema.users).values(values).returning().get();

  const admin = await addUser({
    name: "Ava Admin",
    email: "admin@cleanops.dev",
    passwordHash: adminHash,
    role: "admin",
    status: "active",
    createdAt: stamp(-90 * DAY),
  });
  const staff = await addUser({
    name: "Sam Staff",
    email: "user@cleanops.dev",
    passwordHash: staffHash,
    role: "user",
    status: "active",
    createdAt: stamp(-88 * DAY),
  });

  const crew: (typeof schema.users.$inferSelect)[] = [];
  for (const person of WORKER_DATA) {
    crew.push(
      await addUser({
        name: person.name,
        email: person.email,
        passwordHash: crewHash,
        role: "user",
        status: "active",
        createdAt: stamp(-80 * DAY),
      }),
    );
  }

  await db
    .insert(schema.users)
    .values([
      { name: "Nadia Rahman", email: "nadia@cleanops.dev", passwordHash: memberHash, role: "user", status: "active", createdAt: stamp(-30 * DAY) },
      { name: "Leo Park", email: "leo@cleanops.dev", passwordHash: memberHash, role: "user", status: "active", createdAt: stamp(-24 * DAY) },
      { name: "Blocked Bob", email: "bob@cleanops.dev", passwordHash: memberHash, role: "user", status: "banned", createdAt: stamp(-20 * DAY) },
      { name: "Pending Pat", email: "pat@cleanops.dev", passwordHash: memberHash, role: "user", status: "pending", createdAt: stamp(-2 * DAY) },
    ])
    .run();

  const sites: (typeof schema.sites.$inferSelect)[] = [];
  for (const site of SITE_DATA) {
    sites.push(
      await db.insert(schema.sites).values({ ...site, createdAt: stamp(-85 * DAY) }).returning().get(),
    );
  }

  const workers: (typeof schema.workers.$inferSelect)[] = [];
  for (let i = 0; i < WORKER_DATA.length; i++) {
    workers.push(
      await db
        .insert(schema.workers)
        .values({ ...WORKER_DATA[i], userId: crew[i].id, createdAt: stamp(-80 * DAY) })
        .returning()
        .get(),
    );
  }
  workers.push(
    await db
      .insert(schema.workers)
      .values({ ...UNLINKED_WORKER, createdAt: stamp(-12 * DAY) })
      .returning()
      .get(),
  );

  for (const [siteIdx, workerIdx] of ASSIGNMENT_PAIRS) {
    await db
      .insert(schema.assignments)
      .values({
        siteId: sites[siteIdx].id,
        workerId: workers[workerIdx].id,
        active: true,
        assignedAt: stamp(-70 * DAY),
      })
      .run();
    await db
      .update(schema.workers)
      .set({ status: "assigned" })
      .where(eq(schema.workers.id, workers[workerIdx].id))
      .run();
  }

  const people = [admin, staff, ...crew];
  const made: (typeof schema.incidents.$inferSelect)[] = [];

  for (const seed of SEEDS) {
    const site = sites[seed.siteIdx];
    const worker = seed.workerIdx === null ? null : workers[seed.workerIdx];
    const reporter = seed.siteIdx === 3 ? admin : staff;
    const due = stamp(seed.dueAt);
    const ai = await analyzeIncident({
      title: seed.title,
      description: seed.description,
      category: seed.category,
      siteName: site.name,
    });

    const incident = await db
      .insert(schema.incidents)
      .values({
        title: seed.title,
        description: seed.description,
        category: seed.category,
        siteId: site.id,
        reportedBy: reporter.id,
        assignedTo: worker?.id ?? null,
        status: seed.status,
        severity: seed.severity,
        aiSummary: ai.summary,
        aiSeverity: ai.severity,
        aiSuggestedAction: ai.suggestedAction,
        aiRecommendedRole: ai.recommendedRole,
        aiResponseWindow: seed.responseWindow,
        aiSource: ai.source,
        resolutionNote: seed.note ?? null,
        dueAt: due,
        createdAt: stamp(seed.reportedAt),
        updatedAt: stamp(seed.resolvedAt ?? seed.reportedAt),
        resolvedAt: seed.resolvedAt === undefined ? null : stamp(seed.resolvedAt),
      })
      .returning()
      .get();
    made.push(incident);

    const events: (typeof schema.incidentEvents.$inferInsert)[] = [
      {
        incidentId: incident.id,
        actorId: reporter.id,
        actorName: reporter.name,
        type: "created",
        message: `Reported at ${site.name}`,
        createdAt: stamp(seed.reportedAt),
      },
      {
        incidentId: incident.id,
        actorName: "CleanOps AI",
        type: "ai",
        message: `Graded ${ai.severity} and suggested a ${ai.recommendedRole}`,
        toValue: ai.severity,
        createdAt: stamp(seed.reportedAt + 0.02),
      },
      {
        incidentId: incident.id,
        actorName: "System",
        type: "due",
        message: `Response deadline set to ${due} UTC`,
        toValue: due,
        createdAt: stamp(seed.reportedAt + 0.03),
      },
    ];

    if (worker) {
      events.push({
        incidentId: incident.id,
        actorId: admin.id,
        actorName: admin.name,
        type: "assigned",
        message: `Assigned to ${worker.name}`,
        toValue: worker.name,
        createdAt: stamp(seed.reportedAt + 0.15),
      });
    }
    if (seed.status === "in_progress" || seed.status === "resolved") {
      events.push({
        incidentId: incident.id,
        actorId: worker?.userId ?? admin.id,
        actorName: worker?.name ?? admin.name,
        type: "status",
        message: "Status changed from assigned to in progress",
        fromValue: "assigned",
        toValue: "in_progress",
        createdAt: stamp(seed.reportedAt + 0.4),
      });
    }
    if (seed.resolvedAt !== undefined) {
      events.push({
        incidentId: incident.id,
        actorId: worker?.userId ?? admin.id,
        actorName: worker?.name ?? admin.name,
        type: "resolved",
        message: seed.note ? `Resolved. ${seed.note}` : "Marked as resolved",
        fromValue: "in_progress",
        toValue: "resolved",
        createdAt: stamp(seed.resolvedAt),
      });
    }
    await db.insert(schema.incidentEvents).values(events).run();

    if (seed.comments?.length) {
      await db
        .insert(schema.incidentComments)
        .values(
          seed.comments.map(([who, at, body]) => ({
            incidentId: incident.id,
            authorId: people[who].id,
            authorName: people[who].name,
            body,
            createdAt: stamp(seed.reportedAt + at),
          })),
        )
        .run();
    }

    if (seed.tasks?.length) {
      await db
        .insert(schema.incidentTasks)
        .values(
          seed.tasks.map(([title, done], index) => ({
            incidentId: incident.id,
            title,
            done,
            createdBy: admin.id,
            doneBy: done ? (worker?.userId ?? admin.id) : null,
            doneAt: done ? stamp(seed.reportedAt + 0.5 + index * 0.4) : null,
            createdAt: stamp(seed.reportedAt + 0.25),
          })),
        )
        .run();
    }
  }

  const tile = made[8];
  const mat = made[9];
  const condensate = made[10];
  const escalator = made[11];
  const sharps = made[4];

  await db
    .insert(schema.notifications)
    .values([
      { userId: admin.id, type: "security", title: "Response deadline missed", body: `${tile.title} is past its deadline and still open.`, link: `/incidents/${tile.id}`, createdAt: stamp(-28) },
      { userId: admin.id, type: "security", title: "Overdue and unassigned", body: `${mat.title} has no owner yet.`, link: `/incidents/${mat.id}`, createdAt: stamp(-17) },
      { userId: admin.id, type: "approval", title: "Registration awaiting approval", body: "Pending Pat confirmed their email and is waiting for approval.", link: "/members", createdAt: stamp(-45) },
      { userId: admin.id, type: "comment", title: "New comment", body: `Maria Lopez commented on ${tile.title}.`, link: `/incidents/${tile.id}`, createdAt: stamp(-28), readAt: stamp(-27) },
      { userId: staff.id, type: "resolved", title: "Your report was closed", body: `${sharps.title} was resolved inside the response window.`, link: `/incidents/${sharps.id}`, createdAt: stamp(-287), readAt: stamp(-280) },
      { userId: staff.id, type: "comment", title: "New comment", body: `Ava Admin replied on ${condensate.title}.`, link: `/incidents/${condensate.id}`, createdAt: stamp(-6) },
      { userId: crew[0].id, type: "assignment", title: "Assigned to you", body: `${tile.title} at ${sites[3].name}.`, link: `/incidents/${tile.id}`, createdAt: stamp(-29.8) },
      { userId: crew[1].id, type: "assignment", title: "Assigned to you", body: `${condensate.title} at ${sites[0].name}.`, link: `/incidents/${condensate.id}`, createdAt: stamp(-6.8), readAt: stamp(-6.5) },
      { userId: crew[1].id, type: "security", title: "Due within the hour", body: `${condensate.title} is close to its deadline.`, link: `/incidents/${condensate.id}`, createdAt: stamp(-1) },
      { userId: crew[2].id, type: "assignment", title: "Assigned to you", body: `${escalator.title} at ${sites[1].name}.`, link: `/incidents/${escalator.id}`, createdAt: stamp(-39.8) },
    ])
    .run();

  await db
    .insert(schema.auditLogs)
    .values([
      { actorId: admin.id, actorEmail: admin.email, action: "create", entity: "site", entityId: sites[3].id, detail: `Created site ${sites[3].name} (${sites[3].code})`, ip: "203.0.113.24", userAgent: AGENT, createdAt: stamp(-85 * DAY) },
      { actorId: admin.id, actorEmail: admin.email, action: "create", entity: "worker", entityId: workers[4].id, detail: `Added worker ${workers[4].name}`, ip: "203.0.113.24", userAgent: AGENT, createdAt: stamp(-12 * DAY) },
      { actorId: null, actorEmail: "pat@cleanops.dev", action: "register", entity: "auth", detail: "Registration submitted, awaiting approval", ip: "198.51.100.42", userAgent: AGENT, createdAt: stamp(-2 * DAY) },
      { actorId: null, actorEmail: "bob@cleanops.dev", action: "login_failed", entity: "auth", detail: "Account suspended", ip: "198.51.100.7", userAgent: AGENT, createdAt: stamp(-40) },
      { actorId: null, actorEmail: "admin@cleanops.dev", action: "login_failed", entity: "auth", detail: "Wrong password", ip: "45.33.18.9", userAgent: AGENT, createdAt: stamp(-38) },
      { actorId: null, actorEmail: "admin@cleanops.dev", action: "login_locked", entity: "auth", detail: "Too many attempts from this address", ip: "45.33.18.9", userAgent: AGENT, createdAt: stamp(-37.9) },
      { actorId: admin.id, actorEmail: admin.email, action: "login", entity: "auth", detail: "Signed in", ip: "203.0.113.24", userAgent: AGENT, createdAt: stamp(-31) },
      { actorId: admin.id, actorEmail: admin.email, action: "assign", entity: "incident", entityId: tile.id, detail: `Assigned to ${workers[0].name}`, ip: "203.0.113.24", userAgent: AGENT, createdAt: stamp(-29.8) },
      { actorId: crew[0].id, actorEmail: crew[0].email, action: "work_update", entity: "incident", entityId: tile.id, detail: "Status set to in progress", ip: "203.0.113.99", userAgent: AGENT, createdAt: stamp(-29.6) },
      { actorId: admin.id, actorEmail: admin.email, action: "update", entity: "incident", entityId: mat.id, detail: "Severity raised from low to medium", ip: "203.0.113.24", userAgent: AGENT, createdAt: stamp(-25) },
      { actorId: crew[1].id, actorEmail: crew[1].email, action: "change_password", entity: "user", entityId: crew[1].id, detail: "Password changed, other sessions revoked", ip: "203.0.113.71", userAgent: AGENT, createdAt: stamp(-20) },
      { actorId: admin.id, actorEmail: admin.email, action: "export", entity: "report", detail: "Exported sla report as CSV", ip: "203.0.113.24", userAgent: AGENT, createdAt: stamp(-9) },
      { actorId: admin.id, actorEmail: admin.email, action: "export", entity: "incident", detail: "Exported 14 incidents as CSV", ip: "203.0.113.24", userAgent: AGENT, createdAt: stamp(-8) },
      { actorId: admin.id, actorEmail: admin.email, action: "analyze", entity: "incident", entityId: condensate.id, detail: "Re-ran AI analysis", ip: "203.0.113.24", userAgent: AGENT, createdAt: stamp(-6.9) },
    ])
    .run();

  console.log(`Seed complete: ${sites.length} sites, ${workers.length} workers, ${made.length} incidents.`);
  console.log("   Admin  login: admin@cleanops.dev  / admin123");
  console.log("   Staff  login: user@cleanops.dev   / user123");
  console.log("   Worker login: maria@cleanops.dev  / worker123");
  console.log(`   AI source: ${process.env.OPENROUTER_API_KEY ? "OpenRouter" : "heuristic fallback"}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
