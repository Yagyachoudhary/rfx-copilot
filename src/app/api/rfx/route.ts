import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { headerFromEditor, replaceLinesAndQuestions, syncInvites } from "@/lib/rfx-save";

export async function POST(req: Request) {
  try {
    const ctx = await getContext("api");
    const s = await req.json();
    const h = headerFromEditor(s);
    if (!h.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const { count } = await ctx.supabase.from("rfqs").select("id", { count: "exact", head: true });
    const ref = `RFQ-${new Date().getFullYear()}-${String(200 + (count ?? 0)).padStart(4, "0")}`;
    const { data: rfq, error } = await ctx.supabase
      .from("rfqs")
      .insert({ ...h, org_id: ctx.orgId, ref_code: ref, status: "draft", ai_draft: !!s.ai_draft, created_by: ctx.user.id })
      .select("id")
      .single();
    if (error || !rfq) throw new Error(error?.message ?? "Create failed");
    const counts = await replaceLinesAndQuestions(ctx.supabase, ctx.orgId, rfq.id, s);
    await syncInvites(ctx.supabase, ctx.orgId, rfq.id, s.supplierIds ?? []);
    await audit(ctx, "rfx.created", { rfqId: rfq.id, entityType: "rfq", entityId: rfq.id, details: { ...counts, ai_draft: !!s.ai_draft, ref } });
    return NextResponse.json({ id: rfq.id });
  } catch (e) {
    return jsonError(e);
  }
}
