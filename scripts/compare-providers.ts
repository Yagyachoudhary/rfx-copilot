/**
 * Side-by-side check of Claude vs Gemini on the five sample supplier replies.
 *
 *   1. Claude results:  scripts/out/*.json (from: npx tsx scripts/test-pipeline.ts), else the saved
 *                       readings in sample-data/cached-extractions/ (no Claude key needed)
 *   2. Gemini results:  scripts/out-gemini/*.json (from: AI_PROVIDER=gemini GEMINI_API_KEY=... npx tsx scripts/test-pipeline.ts)
 *   3. npx tsx scripts/compare-providers.ts       → prints a table and writes scripts/out-gemini/comparison.md
 *
 * Measures what matters for the buyer: same prices on the same lines, the traps caught, and the terms read.
 */
import fs from "node:fs";
import path from "node:path";
import { mapExtraction } from "../src/lib/extraction-map";
import { readManifest } from "../src/lib/responses";

const ROOT = process.cwd();
const A = path.join(ROOT, "scripts", "out");
const B = path.join(ROOT, "scripts", "out-gemini");
const m = readManifest();
const lines = m.lines.map((l: any) => ({ id: `L${l.line_no}`, rfq_id: "rfq", ...l }));
const questions = m.questions.map((q: any) => ({ id: `Q${q.q_no}`, rfq_id: "rfq", ...q }));

type Run = { out: any; usage?: { input: number; output: number }; seconds?: number };
const SAVED = path.join(ROOT, "sample-data", "cached-extractions");
const load = (dir: string, id: string): Run | null => {
  const f = path.join(dir, `${id}.json`);
  if (!fs.existsSync(f)) {
    // On a fresh clone, Claude's baseline is the saved sample readings shipped with the repo.
    const saved = path.join(SAVED, `${id}.json`);
    return dir === A && fs.existsSync(saved) ? { out: JSON.parse(fs.readFileSync(saved, "utf8")) } : null;
  }
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  return { out: j.output, usage: j.usage, seconds: j.seconds };
};

function summarise(run: Run) {
  const mapped = mapExtraction(run.out, { orgId: "o", responseId: "r", runId: null, lines: lines as any, questions: questions as any, files: [{ id: "f1", file_name: "f1" }, { id: "f2", file_name: "f2" }] });
  const byLine = new Map<number, number[]>();
  for (const e of mapped.extracted) {
    const no = lines.find((l: any) => l.id === e.mapped_line_id)?.line_no;
    if (no && e.raw_unit_price != null) byLine.set(no, [...(byLine.get(no) ?? []), Number(e.raw_unit_price)]);
  }
  const t = mapped.terms;
  return {
    read: mapped.extracted.length,
    mapped: new Set(mapped.extracted.map((e) => e.mapped_line_id).filter(Boolean)).size,
    unreadable: mapped.extracted.filter((e) => e.legibility !== "clear" || (e.raw_unit_price == null && e.raw_text)).length,
    lowMapping: mapped.extracted.filter((e) => ["low", "none"].includes(String(e.mapping_confidence))).length,
    conflicts: [...byLine.values()].filter((v) => new Set(v).size > 1).length,
    byLine,
    terms: `${t.currency ?? "?"} · tax ${t.tax_treatment}${t.tax_rate_percent ? ` ${t.tax_rate_percent}%` : ""} · freight ${t.freight?.type}${t.freight?.percent ? ` ${t.freight.percent}%` : ""} · pay ${t.payment_days ?? "?"}d`,
    discounts: (t.discounts ?? []).map((d) => `${d.percent ?? "?"}%${d.conditional ? " conditional" : ""}`).join(", ") || "none",
    unresolved: (t.unresolved_references ?? []).length,
  };
}

const rows: string[] = [];
const out = (s = "") => {
  rows.push(s);
  console.log(s);
};
out("| Reply | Model | Lines read | RFx lines mapped | Same price as Claude | Unreadable flagged | Low-confidence mapping | Line priced twice | Terms | Discounts | Unresolved refs | Tokens in/out | Seconds |");
out("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
let agreeTotal = 0;
let bothTotal = 0;
for (const s of m.sample_responses) {
  const id = `${s.supplier}-v${s.version}`;
  const a = load(A, id);
  const b = load(B, id);
  if (!a) continue;
  const sa = summarise(a);
  const sb = b ? summarise(b) : null;
  let agree = 0;
  let both = 0;
  if (sb) {
    for (const [no, pa] of sa.byLine) {
      const pb = sb.byLine.get(no);
      if (!pb) continue;
      both++;
      if (Math.abs(pa[0] - pb[0]) <= Math.max(0.005 * pa[0], 0.01)) agree++;
    }
    agreeTotal += agree;
    bothTotal += both;
  }
  const row = (name: string, x: ReturnType<typeof summarise>, r: Run, same: string) =>
    out(`| ${id} | ${name} | ${x.read} | ${x.mapped} | ${same} | ${x.unreadable} | ${x.lowMapping} | ${x.conflicts} | ${x.terms} | ${x.discounts} | ${x.unresolved} | ${r.usage ? `${r.usage.input}/${r.usage.output}` : "-"} | ${r.seconds ? Math.round(r.seconds) : "-"} |`);
  row("Claude", sa, a, "-");
  if (sb && b) row("Gemini", sb, b, `${agree}/${both}`);
  else out(`| ${id} | Gemini | not run yet | | | | | | | | | | |`);
}
out();
out(bothTotal ? `Price agreement on lines both models mapped: ${agreeTotal}/${bothTotal} (${Math.round((100 * agreeTotal) / bothTotal)}%)` : "No Gemini results yet.");
fs.mkdirSync(B, { recursive: true });
fs.writeFileSync(path.join(B, "comparison.md"), rows.join("\n") + "\n");
