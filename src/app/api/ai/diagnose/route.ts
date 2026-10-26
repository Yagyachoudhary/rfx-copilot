import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { MODELS, PROVIDER, aiConfigured } from "@/lib/ai/client";
import { pingModel, traceText, type Attempt } from "@/lib/ai/gemini";
import { draftRfx } from "@/lib/ai/rfx";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BRIEF = "6-month rate contract for corrugated boxes for our Hosur DC — 3-ply and 5-ply RSC cartons in our standard sizes, partitions, BOPP tape and stretch film";

/**
 * Signed-in diagnostics for the AI provider. Open /api/ai/diagnose in the browser:
 * pings each model, then drafts the same simple RFx four ways (two models × function call / plain JSON)
 * in parallel, with no retries or fallback, and reports how long each took and what Google returned.
 * Uses a little free-tier quota (about 8 requests). Add ?draft=0 to only ping.
 */
export async function GET(req: Request) {
  try {
    await getContext("api");
    const env = {
      provider: PROVIDER,
      keyConfigured: aiConfigured(),
      models: MODELS,
      overrides: Object.fromEntries(["AI_MODEL_ANALYST", "AI_MODEL_EXTRACTION", "AI_MODEL_FAST", "AI_MODEL_FALLBACK", "AI_GEMINI_THINKING", "AI_TIME_BUDGET_SECONDS"].map((k) => [k, process.env[k] ?? null])),
      region: process.env.VERCEL_REGION ?? null,
    };
    if (PROVIDER !== "gemini") return NextResponse.json({ env, note: "AI_PROVIDER is not gemini; nothing to diagnose here." });

    const models = [...new Set(["gemini-flash-latest", "gemini-flash-lite-latest", MODELS.analyst, MODELS.fast])];
    const pings = await Promise.all(models.map((m) => pingModel(m)));

    const runDraft = async (model: string, jsonOnly: boolean) => {
      const trace: Attempt[] = [];
      const t0 = Date.now();
      try {
        const r = await draftRfx({ brief: BRIEF, today: new Date().toISOString().slice(0, 10), orgName: "Diagnostics", suppliers: [], diag: { model, trace, jsonOnly, noFallback: true, budgetSeconds: 240 } });
        return { model, mode: jsonOnly ? "plain JSON" : "function call", ok: true, seconds: (Date.now() - t0) / 1000, lines: r.input.line_items?.length ?? 0, tokens: r.usage, attempts: traceText(trace) };
      } catch (e: any) {
        return { model, mode: jsonOnly ? "plain JSON" : "function call", ok: false, seconds: (Date.now() - t0) / 1000, error: e?.message ?? String(e), attempts: traceText(trace) };
      }
    };
    const wantDraft = new URL(req.url).searchParams.get("draft") !== "0";
    const drafts = wantDraft
      ? await Promise.all([MODELS.analyst, MODELS.fast].flatMap((m) => [runDraft(m, false), runDraft(m, true)]))
      : [];

    return NextResponse.json({ env, pings, drafts }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
