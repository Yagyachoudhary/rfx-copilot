import { NextResponse } from "next/server";
import { getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { clarifyRfx } from "@/lib/ai/rfx";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await getContext("api");
    const { brief, context, answers, hasDocs } = await req.json();
    if (!brief || String(brief).trim().length < 8) return NextResponse.json({ summary: "", questions: [] });
    const { input } = await clarifyRfx({ brief, context, answers, hasDocs });
    return NextResponse.json({ summary: input.summary ?? "", questions: (input.questions ?? []).slice(0, 4) });
  } catch (e) {
    return jsonError(e);
  }
}
