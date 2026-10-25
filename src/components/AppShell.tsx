import Link from "next/link";
import { TopNavLink, UserMenu } from "./NavClient";

export function AppShell({ children, orgName, email, logoUrl }: { children: React.ReactNode; orgName: string; email: string | null; logoUrl: string | null; role: string }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-line">
        <div className="h-[3px]" style={{ background: "var(--nav-gradient)" }} />
        <div className="h-12 px-4 md:px-6 flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt={`${orgName} logo`} className="h-6 max-w-[140px] object-contain" />
            ) : (
              <>
                <span className="w-6 h-6 rounded-md grid place-items-center text-white" style={{ background: "var(--nav-gradient)" }}>
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" /></svg>
                </span>
                <span className="font-bold tracking-tight text-[15px]">RFx Copilot</span>
              </>
            )}
          </Link>
          <nav className="flex items-center gap-1 text-[13px]">
            <TopNavLink href="/" exact>Events</TopNavLink>
            <TopNavLink href="/suppliers">Suppliers</TopNavLink>
            <TopNavLink href="/settings/appearance">Brand</TopNavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:inline-flex chip chip-muted" title="Buyer, suppliers, documents and prices are fictional. Email delivery is simulated; extraction and analysis run live.">Demo data</span>
            <UserMenu orgName={orgName} email={email} />
          </div>
        </div>
      </header>
      <main className="px-4 md:px-6 py-5">{children}</main>
    </div>
  );
}
