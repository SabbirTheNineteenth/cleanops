"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Command, Search, X } from "lucide-react";

const destinations = [
  { href: "/dashboard", title: "Operations dashboard", description: "Priorities, SLA health, and workload" },
  { href: "/incidents", title: "Incidents", description: "Review, triage, and assign work" },
  { href: "/sites", title: "Sites", description: "Manage locations and service coverage" },
  { href: "/workers", title: "Workers", description: "Review workforce availability" },
  { href: "/reports", title: "Reports", description: "SLA and operational reporting" },
  { href: "/notifications", title: "Notifications", description: "Review activity and updates" },
  { href: "/account", title: "Account settings", description: "Manage your profile and preferences" },
];

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled])';

export function WorkspaceSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return destinations;
    return destinations.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(term));
  }, [query]);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openSearch = useCallback(() => {
    setActiveIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [openSearch]);

  useEffect(() => {
    setActiveIndex(0);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", trapFocus);
    };
  }, [close, open]);

  function selectResult(index: number) {
    const item = results[index];
    if (!item) return;
    close(false);
    router.push(item.href);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectResult(activeIndex);
    }
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={openSearch} className="workspace-search-trigger hidden items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs text-ink-500 transition hover:border-brand-300 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:flex" aria-label="Search workspace">
        <Search size={14} />
        <span>Search workspace</span>
        <kbd className="ml-6 inline-flex items-center gap-1 rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-500"><Command size={10} />K</kbd>
      </button>

      {open && (
        <div className="workspace-search-dialog fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
          <div className="absolute inset-0 bg-ink-950/35 backdrop-blur-sm" aria-hidden="true" onMouseDown={() => close()} />
          <div ref={dialogRef} className="workspace-search-panel relative w-full max-w-xl overflow-hidden rounded-xl border border-ink-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Search workspace">
            <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
              <Search size={18} className="text-ink-400" />
              <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleInputKeyDown} placeholder="Search pages and tools" className="min-w-0 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400" aria-label="Search workspace destinations" aria-controls="workspace-search-results" aria-activedescendant={results[activeIndex] ? `workspace-search-result-${activeIndex}` : undefined} />
              <button type="button" onClick={() => close()} className="rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Close search"><X size={17} /></button>
            </div>
            <div className="p-2">
              <p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Workspace destinations</p>
              <p className="sr-only" aria-live="polite">{results.length === 0 ? "No workspace destinations found." : `${results.length} workspace destinations found.`}</p>
              {results.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-ink-500">No workspace destination matches “{query}”.</p>
              ) : (
                <ul id="workspace-search-results" className="space-y-1">
                  {results.map((item, index) => (
                    <li key={item.href}>
                      <Link id={`workspace-search-result-${index}`} href={item.href} onClick={() => close(false)} onMouseEnter={() => setActiveIndex(index)} className={`block rounded-lg px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${activeIndex === index ? "bg-brand-50" : "hover:bg-brand-50"}`}>
                        <p className="text-sm font-semibold text-ink-800">{item.title}</p>
                        <p className="mt-0.5 text-xs text-ink-500">{item.description}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-ink-100 px-4 py-2 text-[10px] text-ink-400"><span>Use ↑ ↓ then Enter to open a destination</span><kbd className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono">Esc</kbd></div>
          </div>
        </div>
      )}
    </>
  );
}
