import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { startProcessing } from "@/lib/processing";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const { data: r } = await ctx.supabase.from("supplier_responses").select("id, rfq_id, status").eq("id", id).single();
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await audit(ctx, "extraction.requested", { rfqId: r.rfq_id, entityType: "supplier_response", entityId: id, details: { previous_status: r.status } });
    await startProcessing(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const { data } = await ctx.supabase.from("supplier_responses").select("id, status, status_detail, error, summary").eq("id", id).single();
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e);
  }
}
