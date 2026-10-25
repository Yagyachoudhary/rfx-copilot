import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { recomputeResponse, refreshOutliers } from "@/lib/pipeline";

const FIELDS = ["mapped_line_id", "raw_unit_price", "raw_price_basis", "raw_basis_quantity", "raw_currency", "tax_inclusive", "exclude", "choose_in_conflict"] as const;

/** Buyer corrections are stored as overrides next to the raw value — the extraction is never overwritten. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: responseId } = await params;
    const ctx = await getContext("api");
    const { extractedLineId, changes, reason } = await req.json();
    if (!reason || String(reason).trim().length < 3) return NextResponse.json({ error: "A reason is required for every correction (audit trail)." }, { status: 400 });
    const { data: line } = await ctx.supabase.from("extracted_quote_lines").select("*").eq("id", extractedLineId).eq("response_id", responseId).single();
    if (!line) return NextResponse.json({ error: "Line not found" }, { status: 404 });
    const { data: resp } = await ctx.supabase.from("supplier_responses").select("rfq_id").eq("id", responseId).single();
    const rows = Object.entries(changes ?? {})
      .filter(([f]) => (FIELDS as readonly string[]).includes(f))
      .map(([field, value]) => ({
        org_id: ctx.orgId,
        response_id: responseId,
        extracted_line_id: extractedLineId,
        field,
        original_value: field in line ? (line as any)[field] : null,
        new_value: value,
        reason: String(reason).trim(),
        user_id: ctx.user.id,
        user_email: ctx.user.email,
      }));
    if (!rows.length) return NextResponse.json({ error: "No changes" }, { status: 400 });
    // supersede previous active overrides of the same field
    for (const r of rows) {
      await ctx.supabase.from("buyer_overrides").update({ is_active: false }).eq("extracted_line_id", extractedLineId).eq("field", r.field).eq("is_active", true);
    }
    const { error } = await ctx.supabase.from("buyer_overrides").insert(rows);
    if (error) throw new Error(error.message);
    const actor = { orgId: ctx.orgId, userId: ctx.user.id, email: ctx.user.email };
    const summary = await recomputeResponse(ctx.supabase, actor, responseId);
    await refreshOutliers(ctx.supabase, actor, resp!.rfq_id);
    await audit(ctx, "value.corrected", { rfqId: resp!.rfq_id, entityType: "extracted_quote_line", entityId: extractedLineId, details: { changes: rows.map((r) => ({ field: r.field, from: r.original_value, to: r.new_value })), reason } });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return jsonError(e);
  }
}

/** Revert: deactivate all overrides for a line (raw extraction applies again). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: responseId } = await params;
    const ctx = await getContext("api");
    const { extractedLineId } = await req.json();
    await ctx.supabase.from("buyer_overrides").update({ is_active: false }).eq("extracted_line_id", extractedLineId).eq("response_id", responseId);
    const { data: resp } = await ctx.supabase.from("supplier_responses").select("rfq_id").eq("id", responseId).single();
    const actor = { orgId: ctx.orgId, userId: ctx.user.id, email: ctx.user.email };
    await recomputeResponse(ctx.supabase, actor, responseId);
    await refreshOutliers(ctx.supabase, actor, resp!.rfq_id);
    await audit(ctx, "value.correction_reverted", { rfqId: resp!.rfq_id, entityType: "extracted_quote_line", entityId: extractedLineId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
