/**
 * Offline end-to-end check of the AI loop on the real sample documents (no Supabase needed):
 *   parse → Claude extraction → mapping → deterministic normalization → exceptions → comparison → scenarios → SQL snapshot.
 *
 *   ANTHROPIC_API_KEY=... npx tsx scripts/test-pipeline.ts [--only shree-balaji,deccan] [--analyst "question"]
 *
 * Raw model outputs are written to scripts/out/ for inspection.
 */
import fs from "node:fs";
import path from "node:path";
import { prepareFile, detectFormat } from "../src/lib/parsers";
import { buildExtractionContent, runExtraction, type ExtractionOutput } from "../src/lib/ai/extract";
import { mapExtraction } from "../src/lib/extraction-map";
import { normalizeLine, resolveConflicts } from "../src/lib/normalize";
import { buildOutlierExceptions, buildResponseExceptions } from "../src/lib/exceptions";
import { buildComparison, computeScenario, inr } from "../src/lib/compare";
import { buildAnalysisDb, runReadOnly } from "../src/lib/analysis-db";
import { runAnalyst } from "../src/lib/ai/analyst";
import { defaultCurrencyPolicy, readManifest, readSampleFile, mimeFor } from "../src/lib/responses";
import type { ExtractedLine, NormalizedLine, QuestionnaireAnswer, RfqLine, RfqQuestion, Supplier, SupplierResponse } from "../src/lib/types";

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const analystQ = args.includes("--analyst") ? args[args.indexOf("--analyst") + 1] : null;
const useCache = args.includes("--cache");
const OUT = path.join(process.cwd(), "scripts", "out");
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const m = readManifest();
  const lines: RfqLine[] = m.lines.map((l: any) => ({ id: `L${l.line_no}`, rfq_id: "rfq", ...l, required_by: null }));
  const questions: RfqQuestion[] = m.questions.map((q: any) => ({ id: `Q${q.q_no}`, rfq_id: "rfq", ...q }));
  const suppliers: Supplier[] = m.suppliers.map((s: any) => ({ id: s.key, name: s.name, short_code: s.short_code, contact_name: s.contact_name, email: s.email, phone: s.phone, location: s.location, is_demo: true }));
  const policy = defaultCurrencyPolicy("INR");
  const rfq = { ref_code: m.rfq.ref_code, title: m.rfq.title, currency: "INR" };

  const responses: SupplierResponse[] = [];
  const allEx: ExtractedLine[] = [];
  const allNorm: NormalizedLine[] = [];
  const allAns: QuestionnaireAnswer[] = [];
  const allExc: any[] = [];
  const fileNames: Record<string, string> = {};

  const samples = m.sample_responses.filter((s) => !only || only.includes(s.supplier));
  // newest version per supplier is active (mirrors the app)
  const latest = new Map<string, number>();
  for (const s of samples) latest.set(s.supplier, Math.max(latest.get(s.supplier) ?? 0, s.version));

  await Promise.all(
    samples.map(async (s) => {
      const respId = `${s.supplier}-v${s.version}`;
      const files = s.files.map((f, i) => ({ id: `${respId}-f${i}`, file_name: path.basename(f.path), path: f.path, kind: f.kind }));
      files.forEach((f) => (fileNames[f.id] = f.file_name));
      const cacheFile = path.join(OUT, `${respId}.json`);
      let out: ExtractionOutput;
      const t0 = Date.now();
      if (useCache && fs.existsSync(cacheFile)) {
        out = JSON.parse(fs.readFileSync(cacheFile, "utf8")).output;
      } else {
        const parts = await Promise.all(files.map((f) => prepareFile(readSampleFile(f.path), f.file_name, detectFormat(f.file_name, mimeFor(f.file_name)), `${f.file_name} (${f.kind}, ${detectFormat(f.file_name, null)})`)));
        const content = buildExtractionContent({ rfq, lines, questions, parts, emailMeta: { subject: s.email_subject, body: s.email_body, channel: s.channel } });
        const r = await runExtraction(content);
        out = r.input;
        fs.writeFileSync(cacheFile, JSON.stringify({ usage: r.usage, seconds: (Date.now() - t0) / 1000, output: out }, null, 2));
        console.log(`[${respId}] extracted in ${((Date.now() - t0) / 1000).toFixed(0)}s · ${r.usage.input} in / ${r.usage.output} out tokens`);
      }
      const mapped = mapExtraction(out, { orgId: "org", responseId: respId, runId: null, lines, questions, files });
      const extracted = mapped.extracted.map((e, i) => ({ ...e, id: `${respId}-e${i + 1}` })) as unknown as ExtractedLine[];
      const resp: SupplierResponse = {
        id: respId, rfq_id: "rfq", supplier_id: s.supplier, version: s.version, is_active: latest.get(s.supplier) === s.version, supersedes_id: null,
        channel: s.channel, received_at: s.received_at, status: "needs_review", status_detail: null, error: null, terms: mapped.terms, summary: {}, email_subject: s.email_subject, email_body: s.email_body, created_at: "",
      };
      const byId = new Map(lines.map((l) => [l.id, l]));
      let norm = extracted.map((line) => normalizeLine({ line, supplierId: s.supplier, rfqLinesById: byId, terms: mapped.terms, policy, baseCurrency: "INR", overrides: [] }));
      norm = resolveConflicts(norm, extracted, []);
      const answers = mapped.answers.map((a, i) => ({ ...a, id: `${respId}-a${i}` })) as unknown as QuestionnaireAnswer[];
      const exc = buildResponseExceptions({ rfqId: "rfq", response: resp, rfqLines: lines, extracted, normalized: norm, terms: mapped.terms, questions, answers, baseCurrency: "INR", rfqPaymentDays: 60, rfqValidityDays: 90 });
      responses.push(resp);
      if (resp.is_active) {
        allEx.push(...extracted);
        allNorm.push(...norm);
        allAns.push(...answers);
        allExc.push(...exc.map((e, i) => ({ ...e, id: `${respId}-x${i}`, status: "open" })));
      }
      const c = norm.filter((n) => n.status === "comparable").length;
      const r = norm.filter((n) => n.status === "needs_review");
      console.log(`\n=== ${s.supplier} v${s.version}${resp.is_active ? "" : " (superseded)"}: ${extracted.length} lines · ${c} comparable · ${r.length} review`);
      console.log(`terms: ccy=${mapped.terms.currency} tax=${mapped.terms.tax_treatment}${mapped.terms.tax_rate_percent ?? ""} freight=${mapped.terms.freight?.type}${mapped.terms.freight?.percent ? "@" + mapped.terms.freight.percent : ""} pay=${mapped.terms.payment_days} lead=${mapped.terms.lead_time_days} discounts=${(mapped.terms.discounts ?? []).map((d) => `${d.percent}%${d.conditional ? "(cond)" : ""}`).join(",")} unresolved=${(mapped.terms.unresolved_references ?? []).map((u) => u.text).join(" | ")}`);
      for (const n of r.slice(0, 12)) {
        const e = extracted.find((x) => x.id === n.extracted_line_id)!;
        console.log(`  REVIEW seq${e.seq} "${e.raw_text?.slice(0, 50)}" → ${n.status_reason}`);
      }
      console.log(`  exceptions: ${exc.map((e) => `${e.severity[0].toUpperCase()}:${e.type}`).join(", ")}`);
      console.log(`  questionnaire: ${answers.filter((a) => a.raw_answer).map((a) => `${a.question_id}=${JSON.stringify(a.normalized_value?.bool ?? a.normalized_value?.number ?? a.normalized_value?.text)}/${a.evidence_type}`).join(" ")}`);
    }),
  );

  const active = responses.filter((r) => r.is_active);
  const outliers = buildOutlierExceptions(
    "rfq",
    allNorm.filter((n) => n.status === "comparable" && n.rfq_line_id).map((n) => ({ response_id: n.response_id, supplier_id: n.supplier_id, rfq_line_id: n.rfq_line_id!, extracted_line_id: n.extracted_line_id, unit_price_base: n.unit_price_base!, line_no: lines.find((l) => l.id === n.rfq_line_id)!.line_no })),
  );
  allExc.push(...outliers.map((e, i) => ({ ...e, id: `out${i}`, status: "open" })));
  console.log(`\nOutliers: ${outliers.map((o) => o.title).join(" | ") || "none"}`);

  const cmp = buildComparison({ lines, suppliers: suppliers.filter((s) => active.some((r) => r.supplier_id === s.id)), responses: active, normalized: allNorm, extracted: allEx, exceptions: allExc, questions, answers: allAns, fileNames });
  console.log("\n=== Supplier summary");
  for (const s of cmp.suppliers) console.log(`${s.supplier.name.padEnd(38)} coverage ${s.coverage}/30 comparable ${s.comparableCount} review ${s.reviewCount} total ${inr(s.comparableTotal, 0)} · ${s.qualification.label}`);
  const base = { onlyQualified: false, requireVerified: false, includeFreight: true, applyConditionalDiscounts: false, excludeFlagged: true } as const;
  for (const o of [{ ...base, mode: "split_cheapest" as const }, { ...base, mode: "split_cheapest" as const, onlyQualified: true }]) {
    const r = computeScenario(cmp, o);
    console.log(`\n${r.title}: total ${inr(r.total, 0)} complete=${r.totalIsComplete} priced ${r.awards.length} unpriced ${r.unpricedLines.length} · ${r.bySupplier.map((b) => `${b.supplierName}:${b.lines}`).join(", ")} · excluded ${r.excludedSuppliers.map((e) => e.name).join(", ")}`);
  }

  const bundle: any = { rfq: { ...m.rfq, id: "rfq", currency: "INR", currency_policy: policy }, lines, questions, suppliers: cmp.suppliers.map((s) => s.supplier), active, files: Object.entries(fileNames).map(([id, file_name]) => ({ id, file_name })), extracted: allEx, normalized: allNorm, exceptions: allExc, answers: allAns, comparison: cmp };
  const db = await buildAnalysisDb(bundle);
  const q = runReadOnly(db, "SELECT supplier, SUM(comparable) AS comparable, SUM(state='missing') AS missing, SUM(state='needs_review') AS review FROM quotes GROUP BY supplier");
  console.log("\nSQL snapshot check:", q.columns.join(" | "));
  q.rows.forEach((r) => console.log("  ", r.join(" | ")));

  if (analystQ) {
    console.log(`\n=== Analyst: ${analystQ}`);
    await runAnalyst({
      bundle,
      db,
      history: [],
      question: analystQ,
      emit: (e) => {
        if (e.type === "sql") console.log(`  [sql] ${e.purpose}\n${e.query}\n  → ${e.error ?? `${e.rows.length} rows: ${JSON.stringify(e.rows.slice(0, 6))}`}`);
        else if (e.type === "text") console.log(`\n${e.text}`);
        else if (e.type === "chart") console.log(`  [chart] ${e.title} (${e.data.length} pts)`);
        else if (e.type === "export") console.log(`  [export] ${e.fileName}`);
      },
      exportFile: async (fileName) => ({ url: null, fileName }),
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
