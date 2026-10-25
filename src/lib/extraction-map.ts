/** Pure mapping from model output → DB-shaped records. Shared by the pipeline and the offline test harness. */
import type { ExtractionOutput } from "./ai/extract";
import type { RfqLine, RfqQuestion, ResponseTerms } from "./types";

type FileRef = { id: string; file_name: string };

export function mapExtraction(out: ExtractionOutput, ctx: { orgId: string; responseId: string; runId: string | null; lines: RfqLine[]; questions: RfqQuestion[]; files: FileRef[] }) {
  const byNo = new Map(ctx.lines.map((l) => [l.line_no, l]));
  const fileFor = (src: any) => ctx.files[Number(src?.file_index ?? 1) - 1] ?? ctx.files[0];
  const loc = (src: any) =>
    src
      ? { file: fileFor(src)?.file_name ?? null, page: src.page ?? null, sheet: src.sheet ?? null, cell: src.cell ?? null, row: src.row ?? null, paragraph: src.paragraph ?? null, region: src.region ?? null }
      : null;
  const num = (v: any) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

  const extracted = (out.lines ?? []).map((l: any, i: number) => ({
    org_id: ctx.orgId,
    response_id: ctx.responseId,
    run_id: ctx.runId,
    source_file_id: fileFor(l.source)?.id ?? null,
    seq: i + 1,
    raw_text: l.raw_text ?? null,
    raw_description: l.raw_description ?? l.raw_text ?? null,
    raw_item_code: l.raw_item_code ?? null,
    mapped_line_id: l.rfq_line_no ? byNo.get(Number(l.rfq_line_no))?.id ?? null : null,
    mapping_confidence: (l.mapping_confidence ?? "none") as any,
    mapping_candidates: (l.candidate_line_nos ?? []).filter((n: number) => byNo.has(n) && n !== Number(l.rfq_line_no)).map((n: number) => ({ line_no: n })),
    mapping_rationale: l.mapping_rationale ?? null,
    raw_quantity: num(l.quantity),
    raw_uom: l.uom ?? null,
    raw_unit_price: num(l.unit_price),
    raw_currency: l.currency ? String(l.currency).toUpperCase() : null,
    raw_price_basis: (l.price_basis ?? "unknown") as any,
    raw_basis_quantity: num(l.basis_quantity),
    pack_size_evidence: l.pack_size_evidence ?? null,
    raw_extended_price: num(l.extended_price),
    raw_tax_note: l.tax_note ?? null,
    lead_time_text: l.lead_time_text ?? null,
    notes: l.notes ?? null,
    confidence: (l.confidence ?? "medium") as any,
    legibility: (l.legibility ?? "clear") as any,
    source_location: loc(l.source),
    source_snippet: l.source_snippet ?? null,
    flags: [] as string[],
  }));

  const o: any = out;
  const obj = (v: any) => (v && typeof v === "object" ? v : {});
  const ccy = o.currency_code ?? obj(o.currency).code ?? null;
  const freightType = o.freight_type ?? obj(o.freight).type ?? "not_stated";
  const terms: ResponseTerms = {
    currency: ccy ? String(ccy).toUpperCase() : null,
    currency_evidence: o.currency_evidence ?? obj(o.currency).evidence ?? null,
    tax_treatment: o.tax_treatment ?? obj(o.tax).treatment ?? "not_stated",
    tax_rate_percent: num(o.tax_rate_percent ?? obj(o.tax).rate_percent),
    tax_text: o.tax_text ?? obj(o.tax).text ?? null,
    freight: {
      type: freightType,
      percent: num(o.freight_percent ?? obj(o.freight).percent),
      amount: num(o.freight_amount ?? obj(o.freight).amount),
      text: o.freight_text ?? obj(o.freight).text ?? null,
      source: o.freight_where ? { file: ctx.files[0]?.file_name ?? null, region: o.freight_where } : loc(obj(o.freight).source),
    },
    payment_terms: o.payment_terms_text ?? obj(o.payment_terms).text ?? null,
    payment_days: num(o.payment_days ?? obj(o.payment_terms).days),
    validity_days: num(o.validity_days),
    lead_time_days: num(o.lead_time_days ?? obj(o.lead_time).days),
    lead_time_text: o.lead_time_text ?? obj(o.lead_time).text ?? null,
    discounts: (out.discounts ?? []).map((d) => ({ ...d, percent: d.percent ?? null, condition: d.condition ?? null, source: loc(d.source) })),
    unresolved_references: (out.unresolved_references ?? []).map((r) => ({ text: r.text, source: loc(r.source) })),
    other_notes: [out.document_overview, ...(out.other_notes ?? []), ...(out.extraction_warnings ?? []).map((w) => `⚠ ${w}`)].filter(Boolean),
    quote_reference: out.quote_reference ?? null,
    quote_date: out.quote_date ?? null,
    supersedes_note: out.supersedes_note ?? null,
  };

  const answers = ctx.questions.map((q) => {
    const a = (out.questionnaire ?? []).find((x: any) => Number(x.q_no) === q.q_no);
    return {
      org_id: ctx.orgId,
      response_id: ctx.responseId,
      question_id: q.id,
      raw_answer: a?.raw_answer ?? null,
      normalized_value: a ? { bool: a.value_bool ?? null, number: num(a.value_number), unit: a.value_unit ?? null, text: a.value_text ?? null } : null,
      evidence_type: (a?.evidence_type ?? "none") as any,
      evidence_snippet: a?.evidence_snippet ?? null,
      source_location: a ? loc(a.source) : null,
      confidence: a?.confidence ?? null,
      review_status: (a ? "unverified" : "missing") as any,
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
    };
  });
  return { extracted, terms, answers };
}
