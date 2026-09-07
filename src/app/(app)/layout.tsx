import { redirect } from "next/navigation";
import { getLiveSession } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getLiveSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar user={session} />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}
