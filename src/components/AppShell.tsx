import Link from "next/link";
import { Suspense } from "react";
import { CopilotLauncher } from "./Copilot";
import { GuideOverlay } from "./GuideOverlay";
import { SearchBox, Sidebar, UserMenu } from "./NavClient";

export function AppShell({ children, orgName, email, latestRfqId }: { children: React.ReactNode; orgName: string; email: string | null; latestRfqId: string | null }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-40 h-16 bg-surface border-b border-line flex items-center gap-4 px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 shrink-0 w-[208px]">
          <span className="w-8 h-8 rounded-lg grid place-items-center text-white" style={{ background: "var(--nav-gradient)" }}>
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" /></svg>
          </span>
          <span className="font-extrabold tracking-tight text-[17px]">RFx Copilot</span>
        </Link>
        <span className="hidden lg:inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-surface-muted/60 text-[13px] font-medium" title="Workspace">
          <span className="w-5 h-5 rounded bg-primary/15 text-primary grid place-items-center text-[10px] font-bold">{orgName.slice(0, 1)}</span>
          Sourcing workspace
        </span>
        <Suspense fallback={<div className="flex-1" />}>
          <SearchBox />
        </Suspense>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline-flex chip chip-muted" title="Buyer, suppliers, documents and prices are fictional. Email delivery is simulated; extraction and analysis run live.">Demo data</span>
          <UserMenu orgName={orgName} email={email} />
        </div>
      </header>
      <div className="flex">
        <Sidebar latestRfqId={latestRfqId} />
        <main className="flex-1 min-w-0 px-4 md:px-7 py-6 pb-24">{children}</main>
      </div>
      <CopilotLauncher />
      <GuideOverlay latestRfqId={latestRfqId} />
    </div>
  );
}
