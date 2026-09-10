import DashboardClient, { type DashboardStats } from "@/components/dashboard/DashboardClient";
import { serverApi } from "@/lib/api-server";

export const dynamic = "force-dynamic";

async function loadDashboardStats(): Promise<{ stats: DashboardStats | null; error: string }> {
  try {
    return { stats: await serverApi<DashboardStats>("/stats"), error: "" };
  } catch {
    return { stats: null, error: "Could not load dashboard. Please refresh and try again." };
  }
}

export default async function DashboardPage() {
  const { stats, error } = await loadDashboardStats();
  return <DashboardClient initialStats={stats} initialError={error} />;
}
