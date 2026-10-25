import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { loadRfqBundle } from "@/lib/data";
import { buildXlsx, comparisonSheets, uploadExport } from "@/lib/export";
import { computeScenario, type ScenarioOptions } from "@/lib/compare";

export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getContext("api");
    const b = await loadRfqBundle(ctx.supabase, id);
    if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sp = new URL(req.url).searchParams;
    let scenario = null;
    if (sp.get("mode")) {
      const o: ScenarioOptions = {
        mode: sp.get("mode") === "single_supplier" ? "single_supplier" : "split_cheapest",
        supplierId: sp.get("supplierId") ?? undefined,
        onlyQualified: sp.get("q") === "1",
        requireVerified: sp.get("v") === "1",
        includeFreight: sp.get("f") === "1",
        applyConditionalDiscounts: sp.get("d") === "1",
        excludeFlagged: sp.get("x") === "1",
      };
      scenario = computeScenario(b.comparison, o, b.rfq.currency);
    }
    const buf = await buildXlsx(comparisonSheets(b, scenario));
    const out = await uploadExport(ctx.supabase, ctx.orgId, id, `${b.rfq.ref_code}_comparison.xlsx`, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await audit(ctx, "export.created", { rfqId: id, entityType: "export", entityId: out.path, details: { file: out.fileName, scenario: scenario?.title ?? null } });
    if (!out.url) throw new Error("Could not sign export URL");
    return NextResponse.redirect(out.url);
  } catch (e) {
    return jsonError(e);
  }
}
