"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  AlertTriangle,
  LogOut,
  Radar,
  ShieldCheck,
} from "lucide-react";
import { postJSON } from "@/lib/api";
import type { SessionPayload } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/sites", label: "Sites", icon: Building2 },
  { href: "/workers", label: "Workers", icon: Users },
];

const ADMIN_NAV = [{ href: "/members", label: "Members", icon: ShieldCheck }];

export function Sidebar({ user }: { user: SessionPayload }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user.role === "admin";
  const navItems = isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;

  async function logout() {
    await postJSON("/auth/logout", {});
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-rail-900 text-ink-300">

      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
          <Radar size={20} />
        </div>
        <div>
          <p className="font-display text-lg font-bold leading-none text-white">
            CleanOps
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-ink-500">
            Ops Console
          </p>
        </div>
      </div>

      <p className="px-6 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-500">
        Operations
      </p>
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-white/[0.06] text-white"
                  : "text-ink-400 hover:bg-white/[0.04] hover:text-ink-200"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />
              )}
              <Icon
                size={18}
                className={active ? "text-brand-300" : "text-ink-500 group-hover:text-ink-300"}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-xl border border-white/5 bg-white/[0.03] p-2">
        <div className="flex items-center gap-3 px-1 py-1.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-300">
              {user.role}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-400 transition hover:bg-red-500/10 hover:text-red-300"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
