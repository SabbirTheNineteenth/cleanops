"use client";

import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WorkspaceSearch } from "@/components/WorkspaceSearch";
import type { SessionPayload } from "@/lib/auth";

const titles: Record<string, string> = {
  "/dashboard": "Command center",
  "/incidents": "Incident operations",
  "/sites": "Site portfolio",
  "/workers": "Workforce",
  "/reports": "Operational intelligence",
  "/notifications": "Notifications",
  "/members": "Team access",
  "/audit": "Audit trail",
  "/account": "Account settings",
};

export function AppTopbar({ user }: { user: SessionPayload }) {
  const pathname = usePathname();
  const title = Object.entries(titles).find(([path]) => pathname.startsWith(path))?.[1] ?? "CleanOps";

  return (
    <header className="sticky top-0 z-30 hidden h-[4.5rem] items-center justify-between border-b border-ink-200/70 bg-white/75 px-7 backdrop-blur-xl md:flex">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">Operations workspace</p>
        <h2 className="truncate font-display text-sm font-semibold text-ink-800">{title}</h2>
      </div>
      <div className="flex items-center gap-3">
        <span className="workspace-status inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/85 px-3 py-1.5 text-xs font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-emerald-500" />
          Live workspace
        </span>
        <WorkspaceSearch />
        <ThemeToggle />
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white" title={user.name}>
          {user.name.charAt(0).toUpperCase()}
        </div>
        <ShieldCheck size={17} className="text-brand-600" aria-label="Secure workspace" />
      </div>
    </header>
  );
}
