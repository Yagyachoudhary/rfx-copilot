import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { draftRfx } from "@/lib/ai/rfx";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const ctx = await getContext("api");
    const { brief, lines } = await req.json();
    if (!brief || String(brief).trim().length < 10) return NextResponse.json({ error: "Describe the requirement in a sentence or two." }, { status: 400 });
    const { data: suppliers } = await ctx.supabase.from("suppliers").select("id, name, location").order("name");
    const { input, usage } = await draftRfx({ brief, today: new Date().toISOString().slice(0, 10), orgName: ctx.orgName, suppliers: suppliers ?? [], existingLines: lines || null });
    await audit(ctx, "rfx.ai_draft_generated", { details: { brief: String(brief).slice(0, 500), lines: input.line_items?.length ?? 0, tokens: usage } });
    return NextResponse.json({ draft: input });
  } catch (e) {
    return jsonError(e);
  }
}
