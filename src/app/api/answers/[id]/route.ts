import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { recomputeResponse } from "@/lib/pipeline";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const { action, note } = await req.json();
    const status = action === "verify" ? "verified" : action === "reject" ? "rejected" : "unverified";
    const { data: a, error } = await ctx.supabase
      .from("questionnaire_answers")
      .update({ review_status: status, review_note: note ?? null, reviewed_by: ctx.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .select("response_id, question_id")
      .single();
    if (error || !a) throw new Error(error?.message ?? "Not found");
    const { data: resp } = await ctx.supabase.from("supplier_responses").select("rfq_id").eq("id", a.response_id).single();
    await recomputeResponse(ctx.supabase, { orgId: ctx.orgId, userId: ctx.user.id, email: ctx.user.email }, a.response_id);
    await audit(ctx, `questionnaire.${status}`, { rfqId: resp?.rfq_id, entityType: "questionnaire_answer", entityId: id, details: { note } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
