import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { sanitizeTokens } from "@/lib/theme";

/** Approved tokens become a new applied version; the previous one is archived (history kept). */
export async function POST(req: Request) {
  try {
    const ctx = await getContext("api");
    if (ctx.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
    const b = await req.json();
    const tokens = sanitizeTokens(b.tokens);
    const { data: last } = await ctx.supabase.from("organization_theme").select("version, logo_path").order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: applied } = await ctx.supabase.from("organization_theme").select("logo_path").eq("status", "applied").maybeSingle();
    const version = (last?.version ?? 0) + 1;
    await ctx.supabase.from("organization_theme").update({ status: "archived" }).eq("org_id", ctx.orgId).eq("status", "applied");
    const { error } = await ctx.supabase.from("organization_theme").insert({
      org_id: ctx.orgId,
      version,
      label: String(b.label ?? "Theme").slice(0, 80),
      tokens,
      mode: b.mode === "dark" ? "dark" : "light",
      logo_path: b.logoPath ?? applied?.logo_path ?? null,
      source_image_path: b.sourceImagePath ?? null,
      ai_rationale: b.rationale ?? null,
      status: "applied",
      created_by: ctx.user.id,
      applied_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await audit(ctx, "theme.applied", { entityType: "organization_theme", details: { version, label: b.label, ai_assisted: !!b.sourceImagePath } });
    return NextResponse.json({ version });
  } catch (e) {
    return jsonError(e);
  }
}
