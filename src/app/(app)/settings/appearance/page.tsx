import { getContext } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { AppearanceEditor } from "./AppearanceEditor";

export const dynamic = "force-dynamic";

export default async function Appearance() {
  const ctx = await getContext();
  const { data: versions } = await ctx.supabase.from("organization_theme").select("id, version, label, tokens, mode, status, created_at, applied_at, ai_rationale, logo_path").order("version", { ascending: false }).limit(20);
  return (
    <div className="max-w-[1300px]">
      <PageHeader
        eyebrow="Settings"
        title="Brand & workspace appearance"
        subtitle="Match the workspace to your company's look. AI-assisted brand/theme matching proposes design tokens from a screenshot; you review, adjust and approve before anything changes. Themes never change data, permissions or workflows."
        actions={<span className="chip chip-brand">Enterprise plan feature · preview</span>}
      />
      <AppearanceEditor isAdmin={ctx.role === "admin"} current={ctx.theme.tokens} currentMode={ctx.theme.mode} currentVersion={ctx.theme.version} logoUrl={ctx.theme.logoUrl} versions={versions ?? []} orgName={ctx.orgName} />
    </div>
  );
}
