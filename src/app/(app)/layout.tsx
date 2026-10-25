import { AppShell } from "@/components/AppShell";
import { getContext } from "@/lib/context";
import { applyMode, tokensToCssVars } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext("page");
  const vars = tokensToCssVars(applyMode(ctx.theme.tokens, ctx.theme.mode));
  const { data: latest } = await ctx.supabase.from("rfqs").select("id").neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (
    <div style={vars as React.CSSProperties} className="font-sans">
      <AppShell orgName={ctx.orgName} email={ctx.user.email} latestRfqId={latest?.id ?? null}>
        {children}
      </AppShell>
    </div>
  );
}
