/**
 * Deterministic exception generation. Every exception names the field, the reason, where to look
 * and what to do next — not just a confidence score.
 */
import type {
  ExceptionRow,
  ExtractedLine,
  NormalizedLine,
  QuestionnaireAnswer,
  ResponseTerms,
  RfqLine,
  RfqQuestion,
  SupplierResponse,
} from "./types";
import { meetsRule } from "./qualification";

type Ctx = {
  rfqId: string;
  response: Pick<SupplierResponse, "id" | "supplier_id">;
  rfqLines: RfqLine[];
  extracted: ExtractedLine[];
  normalized: NormalizedLine[];
  terms: ResponseTerms;
  questions: RfqQuestion[];
  answers: QuestionnaireAnswer[];
  baseCurrency: string;
  rfqPaymentDays?: number | null;
  rfqValidityDays?: number | null;
};

const fmtLines = (nums: number[]) => nums.map((n) => `L${n}`).join(", ");

export function buildResponseExceptions(ctx: Ctx): ExceptionRow[] {
  const out: ExceptionRow[] = [];
  const { rfqId, response, rfqLines, extracted, normalized, terms } = ctx;
  const base = { rfq_id: rfqId, response_id: response.id, supplier_id: response.supplier_id };
  const lineById = new Map(rfqLines.map((l) => [l.id, l]));
  const exById = new Map(extracted.map((e) => [e.id, e]));
  const add = (e: Omit<ExceptionRow, "rfq_id" | "response_id" | "supplier_id">) => out.push({ ...base, ...e });

  // Coverage — missing lines stay missing and are counted.
  const covered = new Set(normalized.filter((n) => n.rfq_line_id && n.status !== "excluded").map((n) => n.rfq_line_id));
  const ambiguousCandidates = new Set<number>();
  for (const n of normalized) {
    if (!n.rfq_line_id && n.status === "needs_review") {
      const ex = exById.get(n.extracted_line_id);
      ex?.mapping_candidates?.forEach((c) => ambiguousCandidates.add(c.line_no));
    }
  }
  const missing = rfqLines.filter((l) => !covered.has(l.id)).map((l) => l.line_no).sort((a, b) => a - b);
  if (missing.length) {
    const quoted = rfqLines.length - missing.length;
    const maybe = missing.filter((n) => ambiguousCandidates.has(n));
    add({
      fingerprint: "coverage_gap",
      type: "coverage_gap",
      severity: quoted < rfqLines.length / 2 ? "critical" : "warning",
      title: `Quoted ${quoted} of ${rfqLines.length} lines — ${missing.length} missing`,
      explanation: `No price was found for ${fmtLines(missing)}. Missing lines are not treated as zero and are excluded from this supplier's totals.${
        maybe.length ? ` ${fmtLines(maybe)} may be covered by an ambiguous supplier line — resolve the mapping first.` : ""
      }`,
      field: "coverage",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: "Ask the supplier to quote the missing lines, or evaluate them as a split award.",
    });
  }

  // Line-level issues
  for (const n of normalized) {
    const ex = exById.get(n.extracted_line_id);
    if (!ex) continue;
    const ln = n.rfq_line_id ? lineById.get(n.rfq_line_id) : undefined;
    const label = ln ? `L${ln.line_no}` : `"${(ex.raw_description ?? ex.raw_text ?? "line").slice(0, 50)}"`;
    const fp = (t: string) => `${t}:${ex.seq}`;
    const reason = n.status_reason ?? "";
    if (n.status === "needs_review") {
      let type = "needs_review";
      let title = `${label}: needs review`;
      let resolution = "Inspect the source and accept or correct the value.";
      let severity: ExceptionRow["severity"] = "warning";
      if (/Ambiguous mapping|Low-confidence mapping|Not mapped/.test(reason)) {
        type = "ambiguous_mapping";
        title = `${label}: unclear which RFQ line this is`;
        resolution = "Pick the correct RFQ line (or exclude) in the review table.";
      } else if (/pack size|per box/i.test(reason)) {
        type = "pack_size_missing";
        title = `${label}: per-box price without pack size`;
        resolution = "Confirm pack size with the supplier and enter it — the conversion will then be applied.";
      } else if (/per kg|unit weight|RFQ asks per/.test(reason)) {
        type = "uom_mismatch";
        title = `${label}: unit of measure does not match the RFQ`;
        resolution = "Request a per-unit price or box weight from the supplier; do not compare until then.";
      } else if (/unreadable/i.test(reason)) {
        type = "unreadable_value";
        title = `${label}: price unreadable in source`;
        resolution = "Zoom into the source, enter the value manually with a reason, or request a clearer copy.";
      } else if (/Conflicting values/.test(reason)) {
        type = "conflicting_values";
        severity = "critical";
        title = `${label}: two different prices in the same response`;
        resolution = "Choose which value is valid (a revised response may resolve this).";
      } else if (/No price/.test(reason)) {
        type = "missing_price";
        title = `${label}: line listed without a price`;
      } else if (/rate in the RFx currency policy|Currency not stated/.test(reason)) {
        type = "currency_unknown";
        title = `${label}: currency cannot be converted`;
        resolution = "Add an FX rate to the RFx currency policy or confirm the currency.";
      }
      add({
        fingerprint: type === "conflicting_values" && ln ? `conflicting_values:L${ln.line_no}` : fp(type),
        type,
        severity,
        title,
        explanation: reason,
        field: "unit_price",
        rfq_line_id: n.rfq_line_id,
        extracted_line_id: ex.id,
        suggested_resolution: resolution,
      });
    }
    if (n.status === "comparable" && ex.confidence === "low") {
      add({
        fingerprint: fp("low_confidence"),
        type: "low_confidence",
        severity: "warning",
        title: `${label}: low extraction confidence`,
        explanation: `The extractor was not confident about this value${ex.notes ? ` (${ex.notes})` : ""}. It is included in comparisons but should be checked.`,
        field: "unit_price",
        rfq_line_id: n.rfq_line_id,
        extracted_line_id: ex.id,
        suggested_resolution: "Open the source snippet and accept or correct.",
      });
    }
    if (!ex.source_snippet && !ex.source_location?.page && !ex.source_location?.cell && !ex.source_location?.paragraph && !ex.source_location?.region) {
      add({
        fingerprint: fp("no_source"),
        type: "no_source_evidence",
        severity: "warning",
        title: `${label}: no source reference`,
        explanation: "The extractor could not point to where this value came from.",
        field: "source",
        rfq_line_id: n.rfq_line_id,
        extracted_line_id: ex.id,
        suggested_resolution: "Verify against the original file before relying on it.",
      });
    }
  }

  // Response-level terms
  const fx = normalized.find((n) => n.fx_rate);
  if (fx) {
    add({
      fingerprint: "currency_converted",
      type: "currency_converted",
      severity: "info",
      title: `Quoted in ${fx.quote_currency} — converted to ${ctx.baseCurrency}`,
      explanation: `Rate ${fx.fx_rate} ${ctx.baseCurrency}/${fx.quote_currency} as of ${fx.fx_as_of} (${fx.fx_source}). Raw ${fx.quote_currency} prices are preserved; FX risk sits with the buyer if invoiced in ${fx.quote_currency}.`,
      field: "currency",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: "Confirm the rate policy with finance before award.",
    });
  }
  if (terms.tax_treatment === "inclusive") {
    add({
      fingerprint: "tax_inclusive",
      type: "tax_inclusive_converted",
      severity: "info",
      title: `Prices quoted inclusive of GST${terms.tax_rate_percent ? ` ${terms.tax_rate_percent}%` : ""}`,
      explanation: terms.tax_rate_percent
        ? `Normalized prices remove ${terms.tax_rate_percent}% GST so they compare with ex-GST quotes.`
        : "Tax rate not stated, so inclusive prices cannot be converted.",
      field: "tax",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: null,
    });
  } else if (!terms.tax_treatment || terms.tax_treatment === "not_stated") {
    if (normalized.some((n) => n.status === "comparable")) {
      add({
        fingerprint: "tax_not_stated",
        type: "tax_not_stated",
        severity: "warning",
        title: "Tax treatment not stated",
        explanation: "The response does not say whether prices include GST. They are compared as ex-GST, which could understate cost by up to 18% if they are not.",
        field: "tax",
        rfq_line_id: null,
        extracted_line_id: null,
        suggested_resolution: "Ask the supplier to confirm GST treatment.",
      });
    }
  }
  const fr = terms.freight;
  if (fr?.type === "extra_unquantified") {
    add({
      fingerprint: "freight_unquantified",
      type: "freight_unquantified",
      severity: "warning",
      title: "Freight extra — amount not stated",
      explanation: `"${fr.text ?? "freight extra"}". Evaluated cost with freight cannot be computed for this supplier.`,
      field: "freight",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: "Request a freight amount or a delivered price.",
    });
  } else if (fr?.type === "extra_percent" || fr?.type === "extra_amount") {
    add({
      fingerprint: "freight_extra",
      type: "freight_extra",
      severity: "info",
      title: `Freight charged extra${fr.percent ? ` @ ${fr.percent}%` : fr.amount ? ` (${fr.amount})` : ""}`,
      explanation: `${fr.text ?? ""} Normalized unit prices exclude it; the "with freight" scenario adds it.`,
      field: "freight",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: null,
    });
  } else if (!fr || fr.type === "not_stated") {
    add({
      fingerprint: "freight_not_stated",
      type: "freight_not_stated",
      severity: "warning",
      title: "Freight terms not stated",
      explanation: "It is unclear whether prices are delivered to the DC.",
      field: "freight",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: "Confirm delivered pricing.",
    });
  }
  for (const [i, d] of (terms.discounts ?? []).entries()) {
    add({
      fingerprint: `discount:${i}`,
      type: "discount_terms",
      severity: "info",
      title: `${d.conditional ? "Conditional discount" : "Discount"}${d.percent ? ` ${d.percent}%` : ""} found`,
      explanation: `${d.description}${d.condition ? ` — condition: ${d.condition}` : ""}. Not applied to normalized prices${d.conditional ? " because it is conditional" : ""}; toggle it in the decision scenarios.`,
      field: "discount",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: d.conditional ? "Decide whether the condition will be met before counting it." : null,
    });
  }
  for (const [i, r] of (terms.unresolved_references ?? []).entries()) {
    add({
      fingerprint: `unresolved_reference:${i}`,
      type: "unresolved_reference",
      severity: "critical",
      title: "Supplier refers to prices that are not in this response",
      explanation: `"${r.text}". Nothing in this RFx defines those prices, so the referenced lines are treated as not quoted.`,
      field: "coverage",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: "Ask the supplier to state the actual prices line by line.",
    });
  }
  if (ctx.rfqPaymentDays && terms.payment_days && terms.payment_days < ctx.rfqPaymentDays) {
    add({
      fingerprint: "payment_terms_deviation",
      type: "terms_deviation",
      severity: "info",
      title: `Payment terms ${terms.payment_days} days vs ${ctx.rfqPaymentDays} requested`,
      explanation: terms.payment_terms ?? "",
      field: "payment_terms",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: null,
    });
  }
  if (ctx.rfqValidityDays && terms.validity_days && terms.validity_days < ctx.rfqValidityDays) {
    add({
      fingerprint: "validity_short",
      type: "terms_deviation",
      severity: "info",
      title: `Quote valid ${terms.validity_days} days vs ${ctx.rfqValidityDays} requested`,
      explanation: "Prices may lapse before award if the event runs long.",
      field: "validity",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: null,
    });
  }

  // Questionnaire: claims are not facts.
  const answered = ctx.answers.filter((a) => a.review_status !== "missing" && a.raw_answer);
  if (ctx.questions.length && answered.length === 0) {
    add({
      fingerprint: "questionnaire_missing",
      type: "questionnaire_missing",
      severity: "warning",
      title: "Questionnaire not answered",
      explanation: "No questionnaire answers were found, so this supplier cannot be qualified on the must-pass criteria.",
      field: "questionnaire",
      rfq_line_id: null,
      extracted_line_id: null,
      suggested_resolution: "Request questionnaire responses.",
    });
  } else {
    for (const q of ctx.questions.filter((q) => q.must_pass)) {
      const a = ctx.answers.find((x) => x.question_id === q.id);
      if (!a || !a.raw_answer) {
        add({
          fingerprint: `q_missing:${q.q_no}`,
          type: "questionnaire_missing",
          severity: "warning",
          title: `Must-pass Q${q.q_no} not answered`,
          explanation: q.question,
          field: "questionnaire",
          rfq_line_id: null,
          extracted_line_id: null,
          suggested_resolution: "Request the answer from the supplier.",
        });
        continue;
      }
      const meets = meetsRule(q, a);
      if (meets === false) {
        add({
          fingerprint: `q_fail:${q.q_no}`,
          type: "questionnaire_fail",
          severity: "warning",
          title: `Fails must-pass Q${q.q_no}`,
          explanation: `Answer: "${a.raw_answer}". Requirement: ${q.question}`,
          field: "questionnaire",
          rfq_line_id: null,
          extracted_line_id: null,
          suggested_resolution: "Exclude from qualified scenarios or seek a waiver.",
        });
      }
      if (q.requires_evidence && a.review_status === "unverified") {
        add({
          fingerprint: `q_unverified:${q.q_no}`,
          type: "unverified_claim",
          severity: a.evidence_type === "document_attached" ? "info" : "warning",
          title: `Q${q.q_no} is a supplier claim, not verified`,
          explanation:
            a.evidence_type === "document_attached"
              ? "A supporting document is attached but has not been checked by a buyer (issuer, validity, scope)."
              : "No supporting document was provided with the claim.",
          field: "questionnaire",
          rfq_line_id: null,
          extracted_line_id: null,
          suggested_resolution: "Verify the certificate and mark the answer verified or rejected.",
        });
      }
    }
  }
  // one exception per fingerprint (conflicts produce one per RFQ line, not per duplicate row)
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.fingerprint) ? false : (seen.add(e.fingerprint), true)));
}

/** Cross-supplier sanity check: a price far below/above peers is likely a typo or a different basis. */
export function buildOutlierExceptions(
  rfqId: string,
  rows: { response_id: string; supplier_id: string; rfq_line_id: string; extracted_line_id: string; unit_price_base: number; line_no: number }[],
): ExceptionRow[] {
  const byLine = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byLine.get(r.rfq_line_id) ?? [];
    arr.push(r);
    byLine.set(r.rfq_line_id, arr);
  }
  const out: ExceptionRow[] = [];
  for (const [, arr] of byLine) {
    if (arr.length < 3) continue;
    for (const r of arr) {
      const others = arr.filter((o) => o !== r).map((o) => o.unit_price_base).sort((a, b) => a - b);
      const med = others[Math.floor(others.length / 2)];
      const ratio = r.unit_price_base / med;
      if (ratio < 0.4 || ratio > 2.5) {
        out.push({
          rfq_id: rfqId,
          response_id: r.response_id,
          supplier_id: r.supplier_id,
          fingerprint: `outlier:${r.extracted_line_id}`,
          type: "price_outlier",
          severity: "critical",
          title: `L${r.line_no}: price is ${ratio < 1 ? `${Math.round((1 - ratio) * 100)}% below` : `${ratio.toFixed(1)}× above`} other suppliers`,
          explanation: `Normalized ₹${r.unit_price_base.toFixed(2)} vs peer median ₹${med.toFixed(2)}. Possible typo (e.g. decimal place) or a different unit basis.`,
          field: "unit_price",
          rfq_line_id: r.rfq_line_id,
          extracted_line_id: r.extracted_line_id,
          suggested_resolution: "Check the source; confirm with the supplier before using this price.",
        });
      }
    }
  }
  return out;
}
