import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { loadRfqBundle } from "@/lib/data";
import { computeScenario } from "@/lib/compare";
import { callTool, MODELS } from "@/lib/ai/client";

export const maxDuration = 90;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const { scenario: clientScenario, exceptions } = await req.json();
    const b = await loadRfqBundle(ctx.supabase, id);
    if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // recompute from persisted data with the same options key
    const [mode, supplierId, q, v, f, d, x] = String(clientScenario?.key ?? "").split("|");
    const scenario = computeScenario(b.comparison, { mode: mode === "single_supplier" ? "single_supplier" : "split_cheapest", supplierId: supplierId || undefined, onlyQualified: q === "q", requireVerified: v === "v", includeFreight: f === "f", applyConditionalDiscounts: d === "d", excludeFlagged: x === "x" }, b.rfq.currency);
    const suppliers = b.comparison.suppliers.filter((s) => s.response).map((s) => ({ name: s.supplier.name, coverage: `${s.coverage}/${b.lines.length}`, comparable: s.comparableCount, qualification: s.qualification.label, lead_time_days: s.terms.lead_time_days, payment: s.terms.payment_terms, freight: s.terms.freight?.type }));
    const { input } = await callTool<{ text: string }>({
      model: MODELS.analyst,
      system: "You draft a concise award-recommendation rationale for a procurement buyer. Use ONLY the numbers and facts provided — never invent or recompute figures. Structure: Recommendation (1–2 sentences), Why (3–4 bullets), Risks & open items (bullets, include unresolved exceptions and incomplete totals), Before PO (bullets: what to confirm with suppliers). Plain text with simple dashes for bullets, under 220 words. Make clear the buyer makes the final decision.",
      content: JSON.stringify({ rfq: { ref: b.rfq.ref_code, title: b.rfq.title, lines: b.lines.length, currency: b.rfq.currency }, scenario: { title: scenario.title, total: scenario.total, complete: scenario.totalIsComplete, subtotal: scenario.subtotal, freight: scenario.freightTotal, discounts: scenario.discountTotal, by_supplier: scenario.bySupplier, unpriced: scenario.unpricedLines, assumptions: scenario.assumptions, excluded: scenario.excludedSuppliers }, suppliers, open_exceptions_on_awarded: exceptions }),
      tool: { name: "draft", description: "Return the rationale text", input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
      maxTokens: 1500,
    });
    return NextResponse.json({ text: input.text });
  } catch (e) {
    return jsonError(e);
  }
}
