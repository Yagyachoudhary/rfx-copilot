import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { loadRfqBundle } from "@/lib/data";
import { computeScenario } from "@/lib/compare";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const { status, options, rationale, aiDrafted, acknowledgedExceptions } = await req.json();
    if (!["draft", "buyer_confirmed"].includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    if (!rationale || String(rationale).trim().length < (status === "buyer_confirmed" ? 20 : 1)) return NextResponse.json({ error: "Add a rationale (at least a couple of sentences) before confirming." }, { status: 400 });
    // Recompute server-side from persisted data — the client's numbers are never trusted.
    const b = await loadRfqBundle(ctx.supabase, id);
    if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const scenario = computeScenario(b.comparison, options, b.rfq.currency);
    const { error } = await ctx.supabase.from("award_decisions").insert({
      org_id: ctx.orgId,
      rfq_id: id,
      scenario_key: scenario.key,
      scenario,
      assumptions: { options, assumptions: scenario.assumptions, acknowledged_exceptions: acknowledgedExceptions ?? [], ai_drafted_rationale: !!aiDrafted },
      rationale,
      status,
      decided_by: ctx.user.id,
      decided_by_email: ctx.user.email,
    });
    if (error) throw new Error(error.message);
    if (status === "buyer_confirmed") await ctx.supabase.from("rfqs").update({ status: "decided" }).eq("id", id);
    await audit(ctx, status === "buyer_confirmed" ? "decision.confirmed" : "decision.draft_saved", { rfqId: id, details: { scenario: scenario.title, total: scenario.total, complete: scenario.totalIsComplete, suppliers: scenario.bySupplier.map((s) => s.supplierName) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
