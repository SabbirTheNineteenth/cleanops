import { redirect } from "next/navigation";
import { getLiveSession } from "@/lib/api-server";
import { Sidebar } from "@/components/Sidebar";
import { AppTopbar } from "@/components/AppTopbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getLiveSession();
  if (!session) redirect("/login");

  return (
    <div className="workspace-canvas flex min-h-screen bg-[var(--surface-canvas)]">
      <Sidebar user={session} />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <AppTopbar user={session} />
        <div className="workspace-content mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-8 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
