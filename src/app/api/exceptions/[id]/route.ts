import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const { action, note } = await req.json();
    const status = action === "resolve" ? "resolved" : action === "accept_risk" ? "accepted_risk" : "open";
    if (status !== "open" && (!note || String(note).trim().length < 3)) return NextResponse.json({ error: "Add a short note explaining the decision." }, { status: 400 });
    const { data, error } = await ctx.supabase
      .from("exceptions")
      .update({ status, resolution_note: note ?? null, resolved_by: status === "open" ? null : ctx.user.id, resolved_at: status === "open" ? null : new Date().toISOString() })
      .eq("id", id)
      .select("rfq_id, response_id, title")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Not found");
    if (data.response_id) {
      const { data: open } = await ctx.supabase.from("exceptions").select("severity").eq("response_id", data.response_id).eq("status", "open").in("severity", ["critical", "warning"]);
      const { data: r } = await ctx.supabase.from("supplier_responses").select("summary, status").eq("id", data.response_id).single();
      if (r && ["needs_review", "ready"].includes(r.status)) {
        const needs = (open?.length ?? 0) > 0 || (r.summary?.needs_review ?? 0) > 0;
        await ctx.supabase.from("supplier_responses").update({ status: needs ? "needs_review" : "ready" }).eq("id", data.response_id);
      }
    }
    await audit(ctx, `exception.${status}`, { rfqId: data.rfq_id, entityType: "exception", entityId: id, details: { title: data.title, note } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
