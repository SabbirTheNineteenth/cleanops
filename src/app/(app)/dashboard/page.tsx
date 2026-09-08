import { cookies } from "next/headers";
import DashboardClient, { type DashboardStats } from "@/components/dashboard/DashboardClient";
import { app } from "@/server/app";

export const dynamic = "force-dynamic";

async function loadDashboardStats(): Promise<{ stats: DashboardStats | null; error: string }> {
  try {
    const cookie = (await cookies()).toString();
    const response = await app.request(new Request("http://cleanops.local/api/stats", {
      headers: cookie ? { cookie } : undefined,
    }));
    const payload = await response.json() as DashboardStats | { error?: string };
    if (!response.ok) {
      return { stats: null, error: "error" in payload ? payload.error ?? "Could not load dashboard" : "Could not load dashboard" };
    }
    return { stats: payload as DashboardStats, error: "" };
  } catch {
    return { stats: null, error: "Could not load dashboard. Please refresh and try again." };
  }
}

export default async function DashboardPage() {
  const { stats, error } = await loadDashboardStats();
  return <DashboardClient initialStats={stats} initialError={error} />;
}
