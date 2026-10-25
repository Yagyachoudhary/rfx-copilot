import { AppShell } from "@/components/AppShell";
import { getContext } from "@/lib/context";
import { applyMode, tokensToCssVars } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext("page");
  const vars = tokensToCssVars(applyMode(ctx.theme.tokens, ctx.theme.mode));
  return (
    <div style={vars as React.CSSProperties} className="font-sans">
      <AppShell orgName={ctx.orgName} email={ctx.user.email} logoUrl={ctx.theme.logoUrl} role={ctx.role}>
        {children}
      </AppShell>
    </div>
  );
}
