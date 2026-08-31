import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "./schema";
import { analyzeIncident } from "../server/ai";

const url = process.env.DATABASE_URL || "file:cleanops.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
const client = createClient({ url, authToken });
const db = drizzle(client, { schema });

async function main() {
  console.log("Seeding demo data...");

  await db.delete(schema.incidents).run();
  await db.delete(schema.assignments).run();
  await db.delete(schema.workers).run();
  await db.delete(schema.sites).run();
  await db.delete(schema.users).run();

  const adminHash = await bcrypt.hash("admin123", 10);
  const userHash = await bcrypt.hash("user123", 10);
  const admin = await db
    .insert(schema.users)
    .values({
      name: "Ava Admin",
      email: "admin@cleanops.dev",
      passwordHash: adminHash,
      role: "admin",
    })
    .returning()
    .get();
  const staff = await db
    .insert(schema.users)
    .values({
      name: "Sam Staff",
      email: "user@cleanops.dev",
      passwordHash: userHash,
      role: "user",
    })
    .returning()
    .get();

  const memberHash = await bcrypt.hash("member123", 10);
  await db.insert(schema.users)
    .values([
      { name: "Nadia Rahman", email: "nadia@cleanops.dev", passwordHash: memberHash, role: "user", status: "active" },
      { name: "Leo Park", email: "leo@cleanops.dev", passwordHash: memberHash, role: "user", status: "active" },
      { name: "Blocked Bob", email: "bob@cleanops.dev", passwordHash: memberHash, role: "user", status: "banned" },
      { name: "Pending Pat", email: "pat@cleanops.dev", passwordHash: memberHash, role: "user", status: "pending" },
    ])
    .run();

  const siteData = [
    { name: "Downtown Tower", code: "DT-01", location: "12 Market St", status: "active" as const },
    { name: "Riverside Mall", code: "RM-02", location: "88 River Rd", status: "active" as const },
    { name: "Airport Terminal B", code: "AT-03", location: "Terminal B, Gate 4", status: "active" as const },
    { name: "Old Depot", code: "OD-04", location: "5 Industrial Ave", status: "inactive" as const },
  ];
  const sites: (typeof schema.sites.$inferSelect)[] = [];
  for (const s of siteData) {
    sites.push(await db.insert(schema.sites).values(s).returning().get());
  }

  const workerData = [
    { name: "Maria Lopez", email: "maria@cleanops.dev", phone: "555-0101", role: "Lead Cleaner" },
    { name: "John Carter", email: "john@cleanops.dev", phone: "555-0102", role: "Field Technician" },
    { name: "Priya Nair", email: "priya@cleanops.dev", phone: "555-0103", role: "Safety Officer" },
    { name: "Tom Becker", email: "tom@cleanops.dev", phone: "555-0104", role: "Field Technician" },
  ];
  const workers: (typeof schema.workers.$inferSelect)[] = [];
  for (const w of workerData) {
    workers.push(await db.insert(schema.workers).values(w).returning().get());
  }

  const assign = async (siteIdx: number, workerIdx: number) => {
    await db.insert(schema.assignments)
      .values({
        siteId: sites[siteIdx].id,
        workerId: workers[workerIdx].id,
        active: true,
      })
      .run();
    await db.update(schema.workers)
      .set({ status: "assigned" })
      .where(eq(schema.workers.id, workers[workerIdx].id))
      .run();
  };
  await assign(0, 0);
  await assign(0, 1);
  await assign(1, 2);
  await assign(2, 3);

  const incidentSeeds = [
    { title: "Water leak in lobby ceiling", description: "Steady drip near the main entrance, small puddle forming. Slip hazard.", category: "plumbing", siteIdx: 0 },
    { title: "Broken glass at food court", description: "A glass panel shattered near seating area, sharp fragments on floor.", category: "safety", siteIdx: 1 },
    { title: "Restroom out of supplies", description: "Paper towels and soap need restocking on level 2.", category: "supplies", siteIdx: 1 },
    { title: "Electrical smell near gate 4", description: "Faint burning smell reported close to charging station, possible wiring issue.", category: "electrical", siteIdx: 2 },
    { title: "Floor polish scuff marks", description: "Minor cosmetic scuffing in hallway, low priority.", category: "cosmetic", siteIdx: 0 },
  ];

  for (const s of incidentSeeds) {
    const site = sites[s.siteIdx];
    const ai = await analyzeIncident({
      title: s.title,
      description: s.description,
      category: s.category,
      siteName: site.name,
    });
    await db.insert(schema.incidents)
      .values({
        title: s.title,
        description: s.description,
        category: s.category,
        siteId: site.id,
        reportedBy: staff.id,
        severity: ai.severity,
        aiSummary: ai.summary,
        aiSeverity: ai.severity,
        aiSuggestedAction: ai.suggestedAction,
      })
      .run();
  }

  console.log("Seed complete.");
  console.log("   Admin login: admin@cleanops.dev / admin123");
  console.log("   User  login: user@cleanops.dev  / user123");
  console.log(`   AI source: ${process.env.OPENROUTER_API_KEY ? "OpenRouter" : "heuristic fallback"}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
