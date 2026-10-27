import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { headerFromEditor, replaceLinesAndQuestions, syncInvites } from "@/lib/rfx-save";
import { recomputeResponse, refreshOutliers } from "@/lib/pipeline";

export const maxDuration = 120;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const s = await req.json();
    const { data: rfq } = await ctx.supabase.from("rfqs").select("*").eq("id", id).single();
    if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { count: respCount } = await ctx.supabase.from("supplier_responses").select("id", { count: "exact", head: true }).eq("rfq_id", id);
    const locked = rfq.status !== "draft" || (respCount ?? 0) > 0;
    const h = headerFromEditor(s);
    const update: any = { ...h, updated_at: new Date().toISOString() };
    if (locked) delete update.currency;
    const { error } = await ctx.supabase.from("rfqs").update(update).eq("id", id);
    if (error) throw new Error(error.message);
    if (!locked) await replaceLinesAndQuestions(ctx.supabase, ctx.orgId, id, s);
    await syncInvites(ctx.supabase, ctx.orgId, id, s.supplierIds ?? []);
    const oldRate = rfq.currency_policy?.rates?.USD?.rate;
    const newRate = h.currency_policy.rates.USD.rate;
    let recomputed = 0;
    if (Number(oldRate) !== Number(newRate)) {
      const actor = { orgId: ctx.orgId, userId: ctx.user.id, email: ctx.user.email };
      const { data: active } = await ctx.supabase.from("supplier_responses").select("id, status").eq("rfq_id", id).eq("is_active", true);
      for (const r of (active ?? []).filter((r) => ["needs_review", "ready"].includes(r.status))) {
        await recomputeResponse(ctx.supabase, actor, r.id);
        recomputed++;
      }
      await refreshOutliers(ctx.supabase, actor, id);
    }
    await audit(ctx, "rfx.updated", { rfqId: id, entityType: "rfq", entityId: id, details: { lines_locked: locked, fx_usd: { from: oldRate, to: newRate }, recomputed_responses: recomputed } });
    return NextResponse.json({ ok: true, recomputed });
  } catch (e) {
    return jsonError(e);
  }
}

/** Delete a sourcing event and everything in it (lines, invites, replies, issues, analyst chat, decisions). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    if (ctx.role === "viewer") return NextResponse.json({ error: "Viewers can't delete events." }, { status: 403 });
    const { data: rfq } = await ctx.supabase.from("rfqs").select("id, ref_code, title, is_demo").eq("id", id).maybeSingle();
    if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Delete in dependency order: issues and quote lines point at the event's line items without cascading,
    // and replies can point at earlier versions.
    const db = ctx.supabase;
    const step = async (what: string, q: PromiseLike<{ error: any }>) => {
      const { error } = await q;
      if (error) throw new Error(`Couldn't delete ${what}: ${error.message}`);
    };
    await step("version links", db.from("supplier_responses").update({ supersedes_id: null }).eq("rfq_id", id));
    await step("issues", db.from("exceptions").delete().eq("rfq_id", id));
    await step("supplier replies", db.from("supplier_responses").delete().eq("rfq_id", id));
    await step("the event", db.from("rfqs").delete().eq("id", id));
    // Logged without rfq_id, so the record survives the event's own deletion.
    await audit(ctx, "rfx.deleted", { entityType: "rfq", entityId: id, details: { ref: rfq.ref_code, title: rfq.title, demo: rfq.is_demo } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
