import { NextResponse } from "next/server";
import { audit, getContext } from "@/lib/context";
import { jsonError } from "@/lib/api";
import { draftRfx } from "@/lib/ai/rfx";
import { detectFormat, prepareFile, type PreparedPart } from "@/lib/parsers";

export const maxDuration = 180;

/** JSON { brief, lines } or multipart { brief, context(json), answers(json), files[] } */
export async function POST(req: Request) {
  try {
    const ctx = await getContext("api");
    let brief = "", lines: string | null = null, context: any = {}, answers: any[] = [];
    const parts: PreparedPart[] = [];
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const fd = await req.formData();
      brief = String(fd.get("brief") ?? "");
      context = JSON.parse(String(fd.get("context") ?? "{}"));
      answers = JSON.parse(String(fd.get("answers") ?? "[]"));
      for (const f of fd.getAll("files")) {
        if (typeof f === "string") continue;
        const fmt = detectFormat(f.name, f.type);
        if (fmt === "unsupported") continue;
        parts.push(await prepareFile(Buffer.from(await f.arrayBuffer()), f.name, fmt, f.name));
      }
    } else {
      const j = await req.json();
      brief = j.brief ?? "";
      lines = j.lines || null;
    }
    if (String(brief).trim().length < 8 && !parts.length) return NextResponse.json({ error: "Describe what you need in a sentence, or attach your line list." }, { status: 400 });
    const { data: suppliers } = await ctx.supabase.from("suppliers").select("id, name, location").order("name");
    const { input, usage } = await draftRfx({ brief, today: new Date().toISOString().slice(0, 10), orgName: ctx.orgName, suppliers: suppliers ?? [], existingLines: lines, context, answers, parts });
    await audit(ctx, "rfx.ai_draft_generated", { details: { brief: String(brief).slice(0, 500), files: parts.map((p) => p.label), answers: answers.length, lines: input.line_items?.length ?? 0, tokens: usage } });
    return NextResponse.json({ draft: input });
  } catch (e) {
    return jsonError(e);
  }
}
