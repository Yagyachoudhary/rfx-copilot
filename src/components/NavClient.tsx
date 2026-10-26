"use client";
import { openGuide } from "./GuideOverlay";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BarChart3, CalendarRange, Inbox, LogOut, Plus, Search, Sparkles, Truck } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

export function Sidebar({ latestRfqId }: { latestRfqId: string | null }) {
  const path = usePathname();
  const inEvent = path.match(/^\/rfx\/([0-9a-f-]{36})/)?.[1] ?? null;
  const rfq = inEvent ?? latestRfqId;
  const items = [
    { href: "/rfx/new", label: "Create RFx", icon: Plus, primary: true, active: path === "/rfx/new" },
    { href: "/", label: "Events", icon: CalendarRange, active: path === "/" || (!!inEvent && /^\/rfx\/[^/]+(\/(send|activity))?$/.test(path)) },
    { href: "/suppliers", label: "Suppliers", icon: Truck, active: path.startsWith("/suppliers") },
    { href: rfq ? `/rfx/${rfq}/responses` : "/", label: "Responses", icon: Inbox, active: /\/(responses|exceptions)/.test(path), disabled: !rfq },
    { href: rfq ? `/rfx/${rfq}/compare` : "/", label: "Comparison", icon: BarChart3, active: /\/(compare|decision)$/.test(path), disabled: !rfq },
    { href: rfq ? `/rfx/${rfq}/analyst` : "/", label: "AI Analyst", icon: Sparkles, active: path.endsWith("/analyst"), disabled: !rfq },
  ];
  return (
    <aside className="hidden md:flex sticky top-16 h-[calc(100vh-4rem)] w-[232px] shrink-0 flex-col justify-between border-r border-line bg-surface p-3">
      <nav className="space-y-1">
        {items.map((it) => (
          <Link
            key={it.label}
            href={it.href}
            aria-disabled={it.disabled}
            className={clsx(
              "relative flex items-center gap-3 h-11 px-3 rounded-xl text-[14px] transition-colors",
              it.active ? "bg-primary/[0.08] text-primary font-semibold" : "text-ink-muted hover:bg-surface-muted/60 hover:text-ink",
              it.disabled && "opacity-40 pointer-events-none",
            )}
          >
            {it.active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r bg-primary" />}
            {it.primary ? (
              <span className="w-6 h-6 rounded-full bg-primary text-primary-fg grid place-items-center"><it.icon className="w-4 h-4" /></span>
            ) : (
              <it.icon className="w-[18px] h-[18px] ml-[3px] mr-[3px]" />
            )}
            {it.label}
          </Link>
        ))}
      </nav>
      <div className="rounded-2xl bg-primary/[0.06] p-4">
        <span className="w-8 h-8 rounded-lg grid place-items-center text-white" style={{ background: "var(--nav-gradient)" }}><Sparkles className="w-4 h-4" /></span>
        <div className="text-[13px] font-medium mt-3 leading-snug">AI-powered procurement, from request to award</div>
        <button
          className="text-[13px] text-primary font-semibold mt-2"
          onClick={() => {
            try {
              localStorage.removeItem("rfxc:guide-dismissed");
            } catch {}
            openGuide();
          }}
        >
          Show me around →
        </button>
      </div>
    </aside>
  );
}

export function SearchBox() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  return (
    <form
      className="hidden md:flex flex-1 max-w-xl items-center gap-2 h-10 px-3 rounded-xl bg-canvas border border-line focus-within:border-accent"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/");
      }}
    >
      <Search className="w-4 h-4 text-ink-muted" />
      <input className="flex-1 bg-transparent outline-none text-[13.5px] placeholder:text-ink-muted/70" placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
    </form>
  );
}

export function UserMenu({ orgName, email }: { orgName: string; email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initials = (email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2.5 text-[13px]" aria-label="Account">
        <span className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold text-white" style={{ background: "var(--nav-gradient)" }}>{initials}</span>
        <span className="hidden md:block text-left leading-tight">
          <span className="block font-semibold">{orgName}</span>
          <span className="block text-ink-muted text-[12px]">Procurement team</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 card shadow-lg p-2 text-[13px]" onMouseLeave={() => setOpen(false)}>
          <div className="px-2 py-1.5 text-ink-muted truncate">{email}</div>
          <button
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-muted/60"
            onClick={async () => {
              await createClient().auth.signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
