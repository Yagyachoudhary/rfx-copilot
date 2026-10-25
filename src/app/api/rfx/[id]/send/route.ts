import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const { channel, supplierIds, subject, body } = await req.json();
    if (!Array.isArray(supplierIds) || !supplierIds.length) return NextResponse.json({ error: "Select at least one supplier" }, { status: 400 });
    const { count } = await ctx.supabase.from("rfq_line_items").select("id", { count: "exact", head: true }).eq("rfq_id", id);
    if (!count) return NextResponse.json({ error: "Add line items before sending" }, { status: 400 });
    const at = new Date().toISOString();
    const { data: sups } = await ctx.supabase.from("suppliers").select("id, name, contact_name").in("id", supplierIds);
    for (const s of sups ?? []) {
      const personal = String(body ?? "").replaceAll("{supplier_name}", s.name).replaceAll("{contact_name}", s.contact_name ?? "Sir/Madam");
      await ctx.supabase
        .from("rfq_suppliers")
        .update({ channel, delivery_status: "delivered", invited_at: at, delivered_at: at, message_subject: subject, message_body: personal })
        .eq("rfq_id", id)
        .eq("supplier_id", s.id);
    }
    await ctx.supabase.from("rfqs").update({ status: "collecting" }).eq("id", id).in("status", ["draft", "sent"]);
    await audit(ctx, "rfx.sent", { rfqId: id, entityType: "rfq", entityId: id, details: { channel, suppliers: (sups ?? []).map((s) => s.name), simulated: true } });
    return NextResponse.json({ sent: sups?.length ?? 0, at });
  } catch (e) {
    return jsonError(e);
  }
}
