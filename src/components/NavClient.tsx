"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

export function TopNavLink({ href, children, exact }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href || path.startsWith("/rfx") : path.startsWith(href);
  return (
    <Link href={href} className={clsx("px-2.5 py-1.5 rounded-md transition-colors", active ? "bg-surface-muted/70 text-ink font-semibold" : "text-ink-muted hover:text-ink")}>
      {children}
    </Link>
  );
}

export function UserMenu({ orgName, email }: { orgName: string; email: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initials = (email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-[13px]" aria-label="Account">
        <span className="hidden md:block text-right leading-tight">
          <span className="block font-semibold">{orgName}</span>
        </span>
        <span className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold text-white" style={{ background: "var(--nav-gradient)" }}>{initials}</span>
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
